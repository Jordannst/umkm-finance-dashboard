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
  type: z.enum(["income", "expense"], {
    message: "type harus 'income' atau 'expense'.",
  }),
  amount: z
    .number({ message: "amount harus angka." })
    .positive({ message: "amount harus lebih dari 0." })
    .max(1_000_000_000_000, { message: "amount terlalu besar." }),
  category_name: z
    .string()
    .trim()
    .max(120)
    .optional()
    .nullable(),
  note: z
    .string()
    .trim()
    .max(280, { message: "note maksimal 280 karakter." })
    .optional()
    .nullable(),
  transaction_date: isoDate.optional(),
  source: z.enum(["chat", "system", "dashboard"]).optional(),
  created_by: z.string().trim().max(120).optional().nullable(),
});

/**
 * POST /api/liana/finance-input
 *
 * Liana panggil ini untuk catat pemasukan/pengeluaran dari hasil parse
 * chat user. Body wajib: business_id, type, amount.
 */
export async function POST(request: Request) {
  const startTotal = Date.now();
  console.log(`[api] route=/api/liana/finance-input start`);

  const { result: authError, durationMs: authMs } = withTimingSync(() =>
    verifyLianaAuth(request),
  );
  if (authError) {
    console.log(
      `[api] route=/api/liana/finance-input auth_ms=${authMs} total_ms=${Date.now() - startTotal} status=401`,
    );
    return authError;
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    console.log(
      `[api] route=/api/liana/finance-input auth_ms=${authMs} total_ms=${Date.now() - startTotal} status=400 reason=invalid_json`,
    );
    return apiError("invalid_json", "Body request bukan JSON valid.", 400);
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    console.log(
      `[api] route=/api/liana/finance-input auth_ms=${authMs} total_ms=${Date.now() - startTotal} status=400 reason=validation_failed`,
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
      `[api] route=/api/liana/finance-input auth_ms=${authMs} db_ms=${dbMs} total_ms=${Date.now() - startTotal} status=404`,
    );
    return apiError("business_not_found", "business_id tidak ditemukan.", 404);
  }

  // Lookup category kalau Liana kirim category_name
  let categoryId: string | null = null;
  let categoryName: string | null = parsed.data.category_name ?? null;
  if (parsed.data.category_name) {
    const { result: cat, durationMs: catMs } = await withTiming(() =>
      lookupCategoryByNameOrSlug(
        parsed.data.business_id,
        parsed.data.type,
        parsed.data.category_name as string,
      ),
    );
    dbMs += catMs;
    if (cat) {
      categoryId = cat.id;
      categoryName = cat.name; // pakai nama kanonik dari DB
    }
    // kalau tidak ketemu, biarkan categoryId null tapi simpan teks raw
  }

  const supabase = createAdminClient();
  const { result: insertResult, durationMs: insertMs } = await withTiming(() =>
    supabase
      .from("transactions")
      .insert({
        business_id: parsed.data.business_id,
        type: parsed.data.type,
        amount: parsed.data.amount,
        category_id: categoryId,
        category_name: categoryName,
        note: parsed.data.note ?? null,
        transaction_date: parsed.data.transaction_date ?? todayJakarta(),
        source: parsed.data.source ?? "chat",
        created_by: parsed.data.created_by ?? "Liana",
      })
      .select(
        "id, business_id, type, amount, category_id, category_name, note, transaction_date, source, created_by, created_at",
      )
      .single(),
  );
  dbMs += insertMs;

  if (insertResult.error) {
    console.error("[liana/finance-input]:", insertResult.error.message);
    console.log(
      `[api] route=/api/liana/finance-input auth_ms=${authMs} db_ms=${dbMs} total_ms=${Date.now() - startTotal} status=500 reason=insert_failed`,
    );
    return apiError("insert_failed", insertResult.error.message, 500);
  }

  const totalMs = Date.now() - startTotal;
  console.log(
    `[api] route=/api/liana/finance-input auth_ms=${authMs} db_ms=${dbMs} total_ms=${totalMs} status=201`,
  );
  return apiOk(
    {
      transaction: insertResult.data,
      category_resolved: categoryId !== null,
    },
    201,
  );
}
