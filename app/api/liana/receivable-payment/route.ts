import { z } from "zod";

import { verifyLianaAuth } from "@/lib/api/liana-auth";
import {
  apiError,
  apiOk,
  zodIssuesToFieldErrors,
} from "@/lib/api/responses";
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
  const authError = verifyLianaAuth(request);
  if (authError) return authError;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return apiError("invalid_json", "Body request bukan JSON valid.", 400);
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(
      "validation_failed",
      "Validasi body gagal.",
      400,
      zodIssuesToFieldErrors(parsed.error.issues),
    );
  }

  const exists = await ensureBusinessExists(parsed.data.business_id);
  if (!exists) {
    return apiError(
      "business_not_found",
      "business_id tidak ditemukan.",
      404,
    );
  }

  // Resolve receivable_id
  let receivableId = parsed.data.receivable_id ?? null;
  if (!receivableId && parsed.data.customer_name) {
    const found = await findActiveReceivableByCustomerName(
      parsed.data.business_id,
      parsed.data.customer_name,
    );
    if (!found) {
      return apiError(
        "receivable_not_found",
        `Tidak ada piutang aktif dengan nama "${parsed.data.customer_name}".`,
        404,
      );
    }
    receivableId = found.id;
  }

  if (!receivableId) {
    return apiError(
      "receivable_not_found",
      "Tidak bisa menentukan piutang yang dibayar.",
      404,
    );
  }

  // Validasi receivable benar-benar milik business yang sama
  // (defense-in-depth — Liana mungkin kirim receivable_id dari business lain).
  const supabase = createAdminClient();
  const { data: rc } = await supabase
    .from("receivables")
    .select("id, business_id, status, amount, paid_amount, customer_name")
    .eq("id", receivableId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!rc) {
    return apiError(
      "receivable_not_found",
      "Piutang tidak ditemukan atau sudah dihapus.",
      404,
    );
  }
  if (rc.business_id !== parsed.data.business_id) {
    return apiError(
      "receivable_business_mismatch",
      "Piutang tidak terdaftar di business_id yang dikirim.",
      403,
    );
  }
  if (rc.status === "paid") {
    return apiError(
      "receivable_already_paid",
      `Piutang ${rc.customer_name} sudah lunas.`,
      409,
    );
  }
  const remaining = Number(rc.amount) - Number(rc.paid_amount);
  if (parsed.data.amount > remaining) {
    return apiError(
      "amount_exceeds_remaining",
      `Jumlah pembayaran (${parsed.data.amount}) melebihi sisa piutang (${remaining}).`,
      400,
      { amount: `Sisa piutang ${rc.customer_name} hanya ${remaining}.` },
    );
  }

  // Panggil RPC atomik
  const { data: result, error } = await supabase.rpc("pay_receivable", {
    p_receivable_id: receivableId,
    p_amount: parsed.data.amount,
    p_payment_date: parsed.data.payment_date ?? todayJakarta(),
    p_note: parsed.data.note ?? null,
    p_source: parsed.data.source ?? "chat",
    p_created_by: parsed.data.created_by ?? "Liana",
  });

  if (error) {
    console.error("[liana/receivable-payment] rpc:", error.message);
    return apiError("payment_failed", error.message, 500);
  }

  return apiOk(
    {
      receivable: result,
      paid: parsed.data.amount,
      message:
        (result as { status?: string } | null)?.status === "paid"
          ? `Piutang ${rc.customer_name} sudah lunas.`
          : `Pembayaran tercatat. Sisa piutang ${rc.customer_name}.`,
    },
    201,
  );
}
