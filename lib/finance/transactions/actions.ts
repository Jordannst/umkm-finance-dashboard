"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentBusinessId, getCurrentProfile } from "@/lib/finance/business";
import { createClient } from "@/lib/supabase/server";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Format tanggal harus YYYY-MM-DD." });

const transactionTypeSchema = z.enum(["income", "expense"], {
  message: "Tipe transaksi harus pemasukan atau pengeluaran.",
});

const baseSchema = z.object({
  type: transactionTypeSchema,
  amount: z
    .number({ message: "Jumlah harus angka." })
    .positive({ message: "Jumlah harus lebih dari 0." })
    .max(1_000_000_000_000, {
      message: "Jumlah terlalu besar.",
    }),
  category_id: z.string().uuid().nullable(),
  note: z
    .string()
    .trim()
    .max(280, { message: "Catatan maksimal 280 karakter." })
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  transaction_date: isoDate,
});

export type TransactionFormState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<
    Record<"type" | "amount" | "category_id" | "note" | "transaction_date", string>
  >;
};

const initialState: TransactionFormState = { ok: false };

function parseAmount(raw: FormDataEntryValue | null): number {
  if (raw === null || raw === undefined) return Number.NaN;
  const cleaned = String(raw)
    .replace(/[^0-9.,-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  return Number(cleaned);
}

function parsePayload(formData: FormData) {
  return baseSchema.safeParse({
    type: formData.get("type"),
    amount: parseAmount(formData.get("amount")),
    category_id:
      formData.get("category_id") && formData.get("category_id") !== ""
        ? String(formData.get("category_id"))
        : null,
    note: formData.get("note") ? String(formData.get("note")) : undefined,
    transaction_date: formData.get("transaction_date"),
  });
}

function fieldErrorsFromZod(
  parsed: ReturnType<typeof parsePayload>,
): TransactionFormState["fieldErrors"] {
  if (parsed.success) return undefined;
  const fe: TransactionFormState["fieldErrors"] = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0] as keyof NonNullable<
      TransactionFormState["fieldErrors"]
    >;
    if (!fe[key]) fe[key] = issue.message;
  }
  return fe;
}

export async function createTransactionAction(
  _prev: TransactionFormState = initialState,
  formData: FormData,
): Promise<TransactionFormState> {
  const businessId = await getCurrentBusinessId();
  if (!businessId) {
    return { ok: false, message: "Akun belum terhubung ke bisnis." };
  }

  const parsed = parsePayload(formData);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFromZod(parsed) };
  }

  const supabase = await createClient();
  const profile = await getCurrentProfile();

  let categoryName: string | null = null;
  if (parsed.data.category_id) {
    const { data: cat } = await supabase
      .from("categories")
      .select("name")
      .eq("id", parsed.data.category_id)
      .eq("business_id", businessId)
      .maybeSingle();
    categoryName = (cat?.name as string | undefined) ?? null;
  }

  const { error } = await supabase.from("transactions").insert({
    business_id: businessId,
    type: parsed.data.type,
    amount: parsed.data.amount,
    category_id: parsed.data.category_id,
    category_name: categoryName,
    note: parsed.data.note,
    transaction_date: parsed.data.transaction_date,
    source: "dashboard",
    created_by: profile?.full_name ?? null,
  });

  if (error) {
    console.error("[createTransactionAction] supabase error:", error.message);
    return { ok: false, message: error.message };
  }

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  return { ok: true, message: "Transaksi berhasil ditambahkan." };
}

export async function updateTransactionAction(
  _prev: TransactionFormState = initialState,
  formData: FormData,
): Promise<TransactionFormState> {
  const id = formData.get("id");
  if (!id || typeof id !== "string") {
    return { ok: false, message: "ID transaksi tidak valid." };
  }

  const businessId = await getCurrentBusinessId();
  if (!businessId) {
    return { ok: false, message: "Akun belum terhubung ke bisnis." };
  }

  const parsed = parsePayload(formData);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFromZod(parsed) };
  }

  const supabase = await createClient();

  let categoryName: string | null = null;
  if (parsed.data.category_id) {
    const { data: cat } = await supabase
      .from("categories")
      .select("name")
      .eq("id", parsed.data.category_id)
      .eq("business_id", businessId)
      .maybeSingle();
    categoryName = (cat?.name as string | undefined) ?? null;
  }

  const { error } = await supabase
    .from("transactions")
    .update({
      type: parsed.data.type,
      amount: parsed.data.amount,
      category_id: parsed.data.category_id,
      category_name: categoryName,
      note: parsed.data.note,
      transaction_date: parsed.data.transaction_date,
    })
    .eq("id", id)
    .eq("business_id", businessId)
    .is("deleted_at", null);

  if (error) {
    console.error("[updateTransactionAction] supabase error:", error.message);
    return { ok: false, message: error.message };
  }

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  return { ok: true, message: "Transaksi berhasil diperbarui." };
}

/**
 * Soft delete: set deleted_at = now(). Tidak menghapus baris fisik
 * supaya history tetap dapat di-restore atau diaudit.
 */
export async function deleteTransactionAction(formData: FormData) {
  const id = formData.get("id");
  if (!id || typeof id !== "string") {
    return { ok: false as const, message: "ID transaksi tidak valid." };
  }

  const businessId = await getCurrentBusinessId();
  if (!businessId) {
    return { ok: false as const, message: "Akun belum terhubung ke bisnis." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("transactions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("business_id", businessId)
    .is("deleted_at", null);

  if (error) {
    console.error("[deleteTransactionAction] supabase error:", error.message);
    return { ok: false as const, message: error.message };
  }

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  return { ok: true as const };
}
