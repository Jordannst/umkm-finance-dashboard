import { z } from "zod";

import { verifyLianaAuth } from "@/lib/api/liana-auth";
import {
  apiError,
  apiOk,
  zodIssuesToFieldErrors,
} from "@/lib/api/responses";
import { withTiming, withTimingSync } from "@/lib/api/instrument";
import { todayJakarta } from "@/lib/finance/format";
import {
  ensureBusinessExists,
  findActiveReceivableByCustomerName,
} from "@/lib/finance/liana/queries";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Format tanggal harus YYYY-MM-DD." });

/**
 * Liana boleh kirim:
 *   - receivable_id: UUID langsung (kalau sudah lookup duluan), atau
 *   - customer_name: nama pelanggan (server cari piutang aktif terdekat)
 * Salah satu wajib ada.
 */
const bodySchema = z
  .object({
    business_id: z.string().uuid(),
    receivable_id: z.string().uuid().optional().nullable(),
    customer_name: z.string().trim().min(2).max(120).optional().nullable(),
    amount: z
      .number({ message: "amount harus angka." })
      .positive({ message: "amount harus lebih dari 0." })
      .max(1_000_000_000_000),
    payment_date: isoDate.optional(),
    note: z.string().trim().max(280).optional().nullable(),
    source: z.enum(["chat", "system", "dashboard"]).optional(),
    created_by: z.string().trim().max(120).optional().nullable(),
  })
  .refine(
    (data) =>
      Boolean(data.receivable_id) || Boolean(data.customer_name),
    {
      message:
        "Harus mengisi salah satu: receivable_id atau customer_name.",
      path: ["receivable_id"],
    },
  );

/**
 * POST /api/liana/receivable-payment
 *
 * Liana panggil ini untuk catat pembayaran piutang. Pakai SQL function
 * `pay_receivable()` agar atomik (insert payment + insert transaction
 * receivable_payment + update receivable.paid_amount + status).
 */
export async function POST(request: Request) {
  const startTotal = Date.now();
  console.log(`[api] route=/api/liana/receivable-payment start`);

  const { result: authError, durationMs: authMs } = withTimingSync(() =>
    verifyLianaAuth(request),
  );
  if (authError) {
    console.log(
      `[api] route=/api/liana/receivable-payment auth_ms=${authMs} total_ms=${Date.now() - startTotal} status=401`,
    );
    return authError;
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    console.log(
      `[api] route=/api/liana/receivable-payment auth_ms=${authMs} total_ms=${Date.now() - startTotal} status=400 reason=invalid_json`,
    );
    return apiError("invalid_json", "Body request bukan JSON valid.", 400);
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    console.log(
      `[api] route=/api/liana/receivable-payment auth_ms=${authMs} total_ms=${Date.now() - startTotal} status=400 reason=validation_failed`,
    );
    return apiError(
      "validation_failed",
      "Validasi body gagal.",
      400,
      zodIssuesToFieldErrors(parsed.error.issues),
    );
  }

  let dbMs = 0;
  const { result: exists, durationMs: existsMs } = await withTiming(() =>
    ensureBusinessExists(parsed.data.business_id),
  );
  dbMs += existsMs;
  if (!exists) {
    console.log(
      `[api] route=/api/liana/receivable-payment auth_ms=${authMs} db_ms=${dbMs} total_ms=${Date.now() - startTotal} status=404`,
    );
    return apiError("business_not_found", "business_id tidak ditemukan.", 404);
  }

  // Resolve receivable_id
  let receivableId = parsed.data.receivable_id ?? null;
  if (!receivableId && parsed.data.customer_name) {
    const { result: found, durationMs: findMs } = await withTiming(() =>
      findActiveReceivableByCustomerName(
        parsed.data.business_id,
        parsed.data.customer_name as string,
      ),
    );
    dbMs += findMs;
    if (!found) {
      console.log(
        `[api] route=/api/liana/receivable-payment auth_ms=${authMs} db_ms=${dbMs} total_ms=${Date.now() - startTotal} status=404 reason=receivable_not_found`,
      );
      return apiError(
        "receivable_not_found",
        `Tidak ada piutang aktif dengan nama "${parsed.data.customer_name}".`,
        404,
      );
    }
    receivableId = found.id;
  }

  if (!receivableId) {
    console.log(
      `[api] route=/api/liana/receivable-payment auth_ms=${authMs} db_ms=${dbMs} total_ms=${Date.now() - startTotal} status=404 reason=no_receivable_id`,
    );
    return apiError(
      "receivable_not_found",
      "Tidak bisa menentukan piutang yang dibayar.",
      404,
    );
  }

  // Validasi receivable benar-benar milik business yang sama
  // (defense-in-depth — Liana mungkin kirim receivable_id dari business lain).
  const supabase = createAdminClient();
  const { result: validateResult, durationMs: validateMs } = await withTiming(
    () =>
      supabase
        .from("receivables")
        .select(
          "id, business_id, status, amount, paid_amount, customer_name",
        )
        .eq("id", receivableId)
        .is("deleted_at", null)
        .maybeSingle(),
  );
  dbMs += validateMs;
  const rc = validateResult.data;

  if (!rc) {
    console.log(
      `[api] route=/api/liana/receivable-payment auth_ms=${authMs} db_ms=${dbMs} total_ms=${Date.now() - startTotal} status=404 reason=receivable_deleted`,
    );
    return apiError(
      "receivable_not_found",
      "Piutang tidak ditemukan atau sudah dihapus.",
      404,
    );
  }
  if (rc.business_id !== parsed.data.business_id) {
    console.log(
      `[api] route=/api/liana/receivable-payment auth_ms=${authMs} db_ms=${dbMs} total_ms=${Date.now() - startTotal} status=403 reason=business_mismatch`,
    );
    return apiError(
      "receivable_business_mismatch",
      "Piutang tidak terdaftar di business_id yang dikirim.",
      403,
    );
  }
  if (rc.status === "paid") {
    console.log(
      `[api] route=/api/liana/receivable-payment auth_ms=${authMs} db_ms=${dbMs} total_ms=${Date.now() - startTotal} status=409 reason=already_paid`,
    );
    return apiError(
      "receivable_already_paid",
      `Piutang ${rc.customer_name} sudah lunas.`,
      409,
    );
  }
  const remaining = Number(rc.amount) - Number(rc.paid_amount);
  if (parsed.data.amount > remaining) {
    console.log(
      `[api] route=/api/liana/receivable-payment auth_ms=${authMs} db_ms=${dbMs} total_ms=${Date.now() - startTotal} status=400 reason=amount_exceeds`,
    );
    return apiError(
      "amount_exceeds_remaining",
      `Jumlah pembayaran (${parsed.data.amount}) melebihi sisa piutang (${remaining}).`,
      400,
      { amount: `Sisa piutang ${rc.customer_name} hanya ${remaining}.` },
    );
  }

  // Panggil RPC atomik
  const { result: rpcResult, durationMs: rpcMs } = await withTiming(() =>
    supabase.rpc("pay_receivable", {
      p_receivable_id: receivableId,
      p_amount: parsed.data.amount,
      p_payment_date: parsed.data.payment_date ?? todayJakarta(),
      p_note: parsed.data.note ?? null,
      p_source: parsed.data.source ?? "chat",
      p_created_by: parsed.data.created_by ?? "Liana",
    }),
  );
  dbMs += rpcMs;

  if (rpcResult.error) {
    console.error("[liana/receivable-payment] rpc:", rpcResult.error.message);
    console.log(
      `[api] route=/api/liana/receivable-payment auth_ms=${authMs} db_ms=${dbMs} total_ms=${Date.now() - startTotal} status=500 reason=payment_failed`,
    );
    return apiError("payment_failed", rpcResult.error.message, 500);
  }

  const totalMs = Date.now() - startTotal;
  console.log(
    `[api] route=/api/liana/receivable-payment auth_ms=${authMs} db_ms=${dbMs} total_ms=${totalMs} status=201`,
  );
  return apiOk(
    {
      receivable: rpcResult.data,
      paid: parsed.data.amount,
      message:
        (rpcResult.data as { status?: string } | null)?.status === "paid"
          ? `Piutang ${rc.customer_name} sudah lunas.`
          : `Pembayaran tercatat. Sisa piutang ${rc.customer_name}.`,
    },
    201,
  );
}
