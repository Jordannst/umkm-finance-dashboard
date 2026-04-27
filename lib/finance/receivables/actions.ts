"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  getCurrentBusinessId,
  getCurrentProfile,
} from "@/lib/finance/business";
import { createClient } from "@/lib/supabase/server";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Format tanggal harus YYYY-MM-DD." });

const createSchema = z.object({
  customer_name: z
    .string()
    .trim()
    .min(2, { message: "Nama pelanggan minimal 2 karakter." })
    .max(120, { message: "Nama pelanggan maksimal 120 karakter." }),
  amount: z
    .number({ message: "Jumlah harus angka." })
    .positive({ message: "Jumlah harus lebih dari 0." })
    .max(1_000_000_000_000, { message: "Jumlah terlalu besar." }),
  category_id: z.string().uuid().nullable().optional(),
  note: z
    .string()
    .trim()
    .max(280, { message: "Catatan maksimal 280 karakter." })
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  due_date: isoDate.nullable().optional(),
});

const paymentSchema = z.object({
  receivable_id: z.string().uuid({ message: "ID piutang tidak valid." }),
  amount: z
    .number({ message: "Jumlah harus angka." })
    .positive({ message: "Jumlah harus lebih dari 0." })
    .max(1_000_000_000_000, { message: "Jumlah terlalu besar." }),
  payment_date: isoDate,
  note: z
    .string()
    .trim()
    .max(280, { message: "Catatan maksimal 280 karakter." })
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
});

export type ReceivableFormState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<
    Record<
      "customer_name" | "amount" | "category_id" | "note" | "due_date",
      string
    >
  >;
};

export type PaymentFormState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<Record<"amount" | "payment_date" | "note", string>>;
};

const initialReceivableState: ReceivableFormState = { ok: false };
const initialPaymentState: PaymentFormState = { ok: false };

function parseAmount(raw: FormDataEntryValue | null): number {
  if (raw === null || raw === undefined) return Number.NaN;
  const cleaned = String(raw)
    .replace(/[^0-9.,-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  return Number(cleaned);
}

function parseCreatePayload(formData: FormData) {
  const due = formData.get("due_date");
  return createSchema.safeParse({
    customer_name: formData.get("customer_name"),
    amount: parseAmount(formData.get("amount")),
    category_id:
      formData.get("category_id") && formData.get("category_id") !== ""
        ? String(formData.get("category_id"))
        : null,
    note: formData.get("note") ? String(formData.get("note")) : undefined,
    due_date: due && due !== "" ? String(due) : null,
  });
}

function flattenIssues(
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>,
): Record<string, string> {
  const fe: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !fe[key]) fe[key] = issue.message;
  }
  return fe;
}

// =====================================================================
// CREATE
// =====================================================================
export async function createReceivableAction(
  _prev: ReceivableFormState = initialReceivableState,
  formData: FormData,
): Promise<ReceivableFormState> {
  const businessId = await getCurrentBusinessId();
  if (!businessId) {
    return { ok: false, message: "Akun belum terhubung ke bisnis." };
  }

  const parsed = parseCreatePayload(formData);
  if (!parsed.success) {
    return { ok: false, fieldErrors: flattenIssues(parsed.error.issues) };
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

  const { error } = await supabase.from("receivables").insert({
    business_id: businessId,
    customer_name: parsed.data.customer_name,
    amount: parsed.data.amount,
    paid_amount: 0,
    status: "unpaid",
    category_id: parsed.data.category_id ?? null,
    category_name: categoryName,
    note: parsed.data.note,
    due_date: parsed.data.due_date ?? null,
    created_from_source: "dashboard",
  });

  if (error) {
    console.error("[createReceivableAction]:", error.message);
    return { ok: false, message: error.message };
  }

  revalidatePath("/receivables");
  revalidatePath("/dashboard");
  return { ok: true, message: "Piutang berhasil ditambahkan." };
}

// =====================================================================
// UPDATE — hanya untuk metadata (customer, category, note, due_date).
// Tidak mengubah amount / paid_amount setelah ada pembayaran.
// =====================================================================
export async function updateReceivableAction(
  _prev: ReceivableFormState = initialReceivableState,
  formData: FormData,
): Promise<ReceivableFormState> {
  const id = formData.get("id");
  if (!id || typeof id !== "string") {
    return { ok: false, message: "ID piutang tidak valid." };
  }

  const businessId = await getCurrentBusinessId();
  if (!businessId) {
    return { ok: false, message: "Akun belum terhubung ke bisnis." };
  }

  const parsed = parseCreatePayload(formData);
  if (!parsed.success) {
    return { ok: false, fieldErrors: flattenIssues(parsed.error.issues) };
  }

  const supabase = await createClient();

  // Cek piutang & sisa pembayaran. Kalau sudah ada pembayaran, amount
  // baru harus >= paid_amount (tidak boleh kurang dari yang sudah dibayar).
  const { data: existing } = await supabase
    .from("receivables")
    .select("paid_amount, status")
    .eq("id", id)
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!existing) {
    return { ok: false, message: "Piutang tidak ditemukan." };
  }

  const paid = Number(existing.paid_amount);
  if (parsed.data.amount < paid) {
    return {
      ok: false,
      fieldErrors: {
        amount: `Jumlah baru tidak boleh kurang dari yang sudah dibayar (${paid}).`,
      },
    };
  }

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

  // Hitung ulang status berdasarkan amount baru.
  let newStatus: "unpaid" | "partial" | "paid" = "unpaid";
  if (paid > 0 && paid < parsed.data.amount) newStatus = "partial";
  else if (paid >= parsed.data.amount) newStatus = "paid";

  const { error } = await supabase
    .from("receivables")
    .update({
      customer_name: parsed.data.customer_name,
      amount: parsed.data.amount,
      category_id: parsed.data.category_id ?? null,
      category_name: categoryName,
      note: parsed.data.note,
      due_date: parsed.data.due_date ?? null,
      status: newStatus,
    })
    .eq("id", id)
    .eq("business_id", businessId)
    .is("deleted_at", null);

  if (error) {
    console.error("[updateReceivableAction]:", error.message);
    return { ok: false, message: error.message };
  }

  revalidatePath("/receivables");
  revalidatePath("/dashboard");
  return { ok: true, message: "Piutang berhasil diperbarui." };
}

// =====================================================================
// DELETE — soft delete
// =====================================================================
export async function deleteReceivableAction(formData: FormData) {
  const id = formData.get("id");
  if (!id || typeof id !== "string") {
    return { ok: false as const, message: "ID piutang tidak valid." };
  }

  const businessId = await getCurrentBusinessId();
  if (!businessId) {
    return { ok: false as const, message: "Akun belum terhubung ke bisnis." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("receivables")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("business_id", businessId)
    .is("deleted_at", null);

  if (error) {
    console.error("[deleteReceivableAction]:", error.message);
    return { ok: false as const, message: error.message };
  }

  revalidatePath("/receivables");
  revalidatePath("/dashboard");
  return { ok: true as const };
}

// =====================================================================
// RECORD PAYMENT — pakai SQL function pay_receivable() untuk atomicity
// =====================================================================
export async function recordPaymentAction(
  _prev: PaymentFormState = initialPaymentState,
  formData: FormData,
): Promise<PaymentFormState> {
  const businessId = await getCurrentBusinessId();
  if (!businessId) {
    return { ok: false, message: "Akun belum terhubung ke bisnis." };
  }

  const parsed = paymentSchema.safeParse({
    receivable_id: formData.get("receivable_id"),
    amount: parseAmount(formData.get("amount")),
    payment_date: formData.get("payment_date"),
    note: formData.get("note") ? String(formData.get("note")) : undefined,
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: flattenIssues(parsed.error.issues) };
  }

  const supabase = await createClient();
  const profile = await getCurrentProfile();

  const { error } = await supabase.rpc("pay_receivable", {
    p_receivable_id: parsed.data.receivable_id,
    p_amount: parsed.data.amount,
    p_payment_date: parsed.data.payment_date,
    p_note: parsed.data.note,
    p_source: "dashboard",
    p_created_by: profile?.full_name ?? null,
  });

  if (error) {
    console.error("[recordPaymentAction] rpc:", error.message);
    return { ok: false, message: error.message };
  }

  revalidatePath("/receivables");
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  return { ok: true, message: "Pembayaran berhasil dicatat." };
}

// =====================================================================
// MARK PAID — bayar sisa penuh dalam 1 klik
// =====================================================================
export async function markPaidAction(formData: FormData) {
  const id = formData.get("id");
  if (!id || typeof id !== "string") {
    return { ok: false as const, message: "ID piutang tidak valid." };
  }

  const businessId = await getCurrentBusinessId();
  if (!businessId) {
    return { ok: false as const, message: "Akun belum terhubung ke bisnis." };
  }

  const supabase = await createClient();

  const { data: rc } = await supabase
    .from("receivables")
    .select("amount, paid_amount, status")
    .eq("id", id)
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!rc) {
    return { ok: false as const, message: "Piutang tidak ditemukan." };
  }
  if (rc.status === "paid") {
    return { ok: false as const, message: "Piutang sudah lunas." };
  }

  const remaining = Number(rc.amount) - Number(rc.paid_amount);
  if (remaining <= 0) {
    return { ok: false as const, message: "Tidak ada sisa untuk dibayar." };
  }

  const profile = await getCurrentProfile();
  const today = new Date().toISOString().slice(0, 10);

  const { error } = await supabase.rpc("pay_receivable", {
    p_receivable_id: id,
    p_amount: remaining,
    p_payment_date: today,
    p_note: "Lunas dari dashboard",
    p_source: "dashboard",
    p_created_by: profile?.full_name ?? null,
  });

  if (error) {
    console.error("[markPaidAction] rpc:", error.message);
    return { ok: false as const, message: error.message };
  }

  revalidatePath("/receivables");
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  return { ok: true as const };
}
