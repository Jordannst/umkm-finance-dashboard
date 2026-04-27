"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  getCurrentBusinessId,
  getCurrentProfile,
} from "@/lib/finance/business";
import { slugify } from "@/lib/finance/slug";
import { createClient } from "@/lib/supabase/server";

// =====================================================================
// Helpers
// =====================================================================

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
// PROFILE
// =====================================================================

const profileSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, { message: "Nama minimal 2 karakter." })
    .max(120, { message: "Nama maksimal 120 karakter." }),
});

export type ProfileFormState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<Record<"full_name", string>>;
};

export async function updateProfileAction(
  _prev: ProfileFormState = { ok: false },
  formData: FormData,
): Promise<ProfileFormState> {
  const profile = await getCurrentProfile();
  if (!profile) {
    return { ok: false, message: "Sesi tidak valid. Silakan login ulang." };
  }

  const parsed = profileSchema.safeParse({
    full_name: formData.get("full_name"),
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: flattenIssues(parsed.error.issues) };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.full_name })
    .eq("id", profile.id);

  if (error) {
    console.error("[updateProfileAction]:", error.message);
    return { ok: false, message: error.message };
  }

  revalidatePath("/settings");
  // Layout pakai full_name di sidebar — refresh juga.
  revalidatePath("/", "layout");
  return { ok: true, message: "Profil berhasil diperbarui." };
}

// =====================================================================
// BUSINESS
// =====================================================================

const businessSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { message: "Nama bisnis minimal 2 karakter." })
    .max(120, { message: "Nama bisnis maksimal 120 karakter." }),
  owner_name: z
    .string()
    .trim()
    .max(120, { message: "Nama owner maksimal 120 karakter." })
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
});

export type BusinessFormState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<Record<"name" | "owner_name", string>>;
};

export async function updateBusinessAction(
  _prev: BusinessFormState = { ok: false },
  formData: FormData,
): Promise<BusinessFormState> {
  const businessId = await getCurrentBusinessId();
  if (!businessId) {
    return { ok: false, message: "Akun belum terhubung ke bisnis." };
  }

  const parsed = businessSchema.safeParse({
    name: formData.get("name"),
    owner_name: formData.get("owner_name") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: flattenIssues(parsed.error.issues) };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("businesses")
    .update({
      name: parsed.data.name,
      owner_name: parsed.data.owner_name,
    })
    .eq("id", businessId);

  if (error) {
    console.error("[updateBusinessAction]:", error.message);
    return { ok: false, message: error.message };
  }

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { ok: true, message: "Profil bisnis berhasil diperbarui." };
}

// =====================================================================
// CATEGORY
// =====================================================================

const categoryCreateSchema = z.object({
  type: z.enum(["income", "expense", "receivable"], {
    message: "Tipe kategori tidak valid.",
  }),
  name: z
    .string()
    .trim()
    .min(2, { message: "Nama kategori minimal 2 karakter." })
    .max(80, { message: "Nama kategori maksimal 80 karakter." }),
});

const categoryUpdateSchema = categoryCreateSchema.extend({
  id: z.string().uuid({ message: "ID kategori tidak valid." }),
});

export type CategoryFormState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<Record<"type" | "name", string>>;
};

export async function createCategoryAction(
  _prev: CategoryFormState = { ok: false },
  formData: FormData,
): Promise<CategoryFormState> {
  const businessId = await getCurrentBusinessId();
  if (!businessId) {
    return { ok: false, message: "Akun belum terhubung ke bisnis." };
  }

  const parsed = categoryCreateSchema.safeParse({
    type: formData.get("type"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: flattenIssues(parsed.error.issues) };
  }

  const slug = slugify(parsed.data.name);
  if (!slug) {
    return {
      ok: false,
      fieldErrors: {
        name: "Nama kategori harus punya minimal 1 karakter alfanumerik.",
      },
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("categories").insert({
    business_id: businessId,
    type: parsed.data.type,
    name: parsed.data.name,
    slug,
  });

  if (error) {
    // Constraint unique (business_id, type, slug) → 23505
    if (error.code === "23505") {
      return {
        ok: false,
        fieldErrors: {
          name: "Kategori dengan nama serupa sudah ada untuk tipe ini.",
        },
      };
    }
    console.error("[createCategoryAction]:", error.message);
    return { ok: false, message: error.message };
  }

  revalidatePath("/settings");
  revalidatePath("/transactions");
  revalidatePath("/receivables");
  return { ok: true, message: "Kategori berhasil ditambahkan." };
}

export async function updateCategoryAction(
  _prev: CategoryFormState = { ok: false },
  formData: FormData,
): Promise<CategoryFormState> {
  const businessId = await getCurrentBusinessId();
  if (!businessId) {
    return { ok: false, message: "Akun belum terhubung ke bisnis." };
  }

  const parsed = categoryUpdateSchema.safeParse({
    id: formData.get("id"),
    type: formData.get("type"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: flattenIssues(parsed.error.issues) };
  }

  const slug = slugify(parsed.data.name);
  if (!slug) {
    return {
      ok: false,
      fieldErrors: {
        name: "Nama kategori harus punya minimal 1 karakter alfanumerik.",
      },
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("categories")
    .update({ name: parsed.data.name, slug })
    .eq("id", parsed.data.id)
    .eq("business_id", businessId)
    .eq("type", parsed.data.type);

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        fieldErrors: {
          name: "Sudah ada kategori lain dengan nama serupa.",
        },
      };
    }
    console.error("[updateCategoryAction]:", error.message);
    return { ok: false, message: error.message };
  }

  revalidatePath("/settings");
  return { ok: true, message: "Kategori berhasil diperbarui." };
}

/**
 * Hard delete kategori. Aman: kolom `category_id` di transactions/receivables
 * pakai `ON DELETE SET NULL`, jadi histori transaksi tetap utuh, tapi
 * `category_id` jadi null. `category_name` (snapshot text) tetap tersimpan.
 */
export async function deleteCategoryAction(formData: FormData) {
  const id = formData.get("id");
  if (!id || typeof id !== "string") {
    return { ok: false as const, message: "ID kategori tidak valid." };
  }

  const businessId = await getCurrentBusinessId();
  if (!businessId) {
    return { ok: false as const, message: "Akun belum terhubung ke bisnis." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", id)
    .eq("business_id", businessId);

  if (error) {
    console.error("[deleteCategoryAction]:", error.message);
    return { ok: false as const, message: error.message };
  }

  revalidatePath("/settings");
  revalidatePath("/transactions");
  revalidatePath("/receivables");
  return { ok: true as const };
}
