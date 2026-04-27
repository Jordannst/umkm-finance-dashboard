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
  const authError = verifyLianaAuth(request);
  if (authError) return authError;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return apiError(
      "invalid_json",
      "Body request bukan JSON valid.",
      400,
    );
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

  // Lookup category kalau Liana kirim category_name
  let categoryId: string | null = null;
  let categoryName: string | null = parsed.data.category_name ?? null;
  if (parsed.data.category_name) {
    const cat = await lookupCategoryByNameOrSlug(
      parsed.data.business_id,
      parsed.data.type,
      parsed.data.category_name,
    );
    if (cat) {
      categoryId = cat.id;
      categoryName = cat.name; // pakai nama kanonik dari DB
    }
    // kalau tidak ketemu, biarkan categoryId null tapi simpan teks raw
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
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
    .single();

  if (error) {
    console.error("[liana/finance-input]:", error.message);
    return apiError("insert_failed", error.message, 500);
  }

  return apiOk(
    {
      transaction: data,
      category_resolved: categoryId !== null,
    },
    201,
  );
}
