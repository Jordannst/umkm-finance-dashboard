import { z } from "zod";

import { verifyLianaAuth } from "@/lib/api/liana-auth";
import {
  apiError,
  apiOk,
  zodIssuesToFieldErrors,
} from "@/lib/api/responses";
import { withTiming, withTimingSync } from "@/lib/api/instrument";
import {
  ensureBusinessExists,
  lookupCategoryByNameOrSlug,
} from "@/lib/finance/liana/queries";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Format tanggal harus YYYY-MM-DD." });

const bodySchema = z.object({
  business_id: z
    .string()
    .uuid({ message: "business_id harus UUID valid." }),
  customer_name: z
    .string()
    .trim()
    .min(2, { message: "customer_name minimal 2 karakter." })
    .max(120),
  amount: z
    .number({ message: "amount harus angka." })
    .positive({ message: "amount harus lebih dari 0." })
    .max(1_000_000_000_000),
  category_name: z.string().trim().max(120).optional().nullable(),
  note: z.string().trim().max(280).optional().nullable(),
  due_date: isoDate.optional().nullable(),
  source: z.enum(["chat", "system", "dashboard"]).optional(),
});

/**
 * POST /api/liana/receivable-input
 *
 * Liana catat piutang baru (status='unpaid') dari hasil parse chat.
 * Piutang baru TIDAK menambah pemasukan — sesuai formula plan.
 */
export async function POST(request: Request) {
  const startTotal = Date.now();
  console.log(`[api] route=/api/liana/receivable-input start`);

  const { result: authError, durationMs: authMs } = withTimingSync(() =>
    verifyLianaAuth(request),
  );
  if (authError) {
    console.log(
      `[api] route=/api/liana/receivable-input auth_ms=${authMs} total_ms=${Date.now() - startTotal} status=401`,
    );
    return authError;
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    console.log(
      `[api] route=/api/liana/receivable-input auth_ms=${authMs} total_ms=${Date.now() - startTotal} status=400 reason=invalid_json`,
    );
    return apiError("invalid_json", "Body request bukan JSON valid.", 400);
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    console.log(
      `[api] route=/api/liana/receivable-input auth_ms=${authMs} total_ms=${Date.now() - startTotal} status=400 reason=validation_failed`,
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
      `[api] route=/api/liana/receivable-input auth_ms=${authMs} db_ms=${dbMs} total_ms=${Date.now() - startTotal} status=404`,
    );
    return apiError("business_not_found", "business_id tidak ditemukan.", 404);
  }

  let categoryId: string | null = null;
  let categoryName: string | null = parsed.data.category_name ?? null;
  if (parsed.data.category_name) {
    const { result: cat, durationMs: catMs } = await withTiming(() =>
      lookupCategoryByNameOrSlug(
        parsed.data.business_id,
        "receivable",
        parsed.data.category_name as string,
      ),
    );
    dbMs += catMs;
    if (cat) {
      categoryId = cat.id;
      categoryName = cat.name;
    }
  }

  const supabase = createAdminClient();
  const { result: insertResult, durationMs: insertMs } = await withTiming(() =>
    supabase
      .from("receivables")
      .insert({
        business_id: parsed.data.business_id,
        customer_name: parsed.data.customer_name,
        amount: parsed.data.amount,
        paid_amount: 0,
        status: "unpaid",
        category_id: categoryId,
        category_name: categoryName,
        note: parsed.data.note ?? null,
        due_date: parsed.data.due_date ?? null,
        created_from_source: parsed.data.source ?? "chat",
      })
      .select(
        "id, business_id, customer_name, amount, paid_amount, status, category_id, category_name, note, due_date, created_from_source, created_at",
      )
      .single(),
  );
  dbMs += insertMs;

  if (insertResult.error) {
    console.error("[liana/receivable-input]:", insertResult.error.message);
    console.log(
      `[api] route=/api/liana/receivable-input auth_ms=${authMs} db_ms=${dbMs} total_ms=${Date.now() - startTotal} status=500 reason=insert_failed`,
    );
    return apiError("insert_failed", insertResult.error.message, 500);
  }

  const totalMs = Date.now() - startTotal;
  console.log(
    `[api] route=/api/liana/receivable-input auth_ms=${authMs} db_ms=${dbMs} total_ms=${totalMs} status=201`,
  );
  return apiOk(
    {
      receivable: insertResult.data,
      category_resolved: categoryId !== null,
    },
    201,
  );
}
