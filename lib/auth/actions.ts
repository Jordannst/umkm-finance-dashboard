"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const credentialsSchema = z.object({
  email: z.string().email({ message: "Format email tidak valid." }),
  password: z
    .string()
    .min(8, { message: "Password minimal 8 karakter." })
    .max(72, { message: "Password maksimal 72 karakter." }),
});

const signUpSchema = credentialsSchema.extend({
  full_name: z
    .string()
    .trim()
    .min(2, { message: "Nama minimal 2 karakter." })
    .max(80, { message: "Nama maksimal 80 karakter." }),
});

export type AuthState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<Record<"email" | "password" | "full_name", string>>;
};

const initialState: AuthState = { ok: false };

function safeRedirect(target: string | null | undefined): string {
  if (!target) return "/dashboard";
  if (!target.startsWith("/")) return "/dashboard";
  if (target.startsWith("//")) return "/dashboard";
  return target;
}

export async function signInAction(
  _prev: AuthState = initialState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const fieldErrors: AuthState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof NonNullable<AuthState["fieldErrors"]>;
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return {
      ok: false,
      message:
        error.message === "Invalid login credentials"
          ? "Email atau password salah."
          : error.message,
    };
  }

  const target = safeRedirect(formData.get("redirect")?.toString());
  revalidatePath("/", "layout");
  redirect(target);
}

export async function signUpAction(
  _prev: AuthState = initialState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    full_name: formData.get("full_name"),
  });

  if (!parsed.success) {
    const fieldErrors: AuthState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof NonNullable<AuthState["fieldErrors"]>;
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.full_name },
    },
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  // Trigger handle_new_user otomatis create profile dan attach ke
  // business demo. Jika email confirmation aktif di Supabase, user
  // tetap perlu klik link verifikasi sebelum bisa login.
  const target = safeRedirect(formData.get("redirect")?.toString());
  revalidatePath("/", "layout");
  redirect(target);
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
