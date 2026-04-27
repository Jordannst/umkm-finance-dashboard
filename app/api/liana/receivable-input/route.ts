import { z } from "zod";

import { verifyLianaAuth } from "@/lib/api/liana-auth";
import {
  apiError,
  apiOk,
  zodIssuesToFieldErrors,
} from "@/lib/api/responses";
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

  let categoryId: string | null = null;
  let categoryName: string | null = parsed.data.category_name ?? null;
  if (parsed.data.category_name) {
    const cat = await lookupCategoryByNameOrSlug(
      parsed.data.business_id,
      "receivable",
      parsed.data.category_name,
    );
    if (cat) {
      categoryId = cat.id;
      categoryName = cat.name;
    }
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
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
    .single();

  if (error) {
    console.error("[liana/receivable-input]:", error.message);
    return apiError("insert_failed", error.message, 500);
  }

  return apiOk(
    {
      receivable: data,
      category_resolved: categoryId !== null,
    },
    201,
  );
}
