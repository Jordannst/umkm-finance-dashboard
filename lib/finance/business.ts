import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { Business, Profile } from "@/types/finance";

/**
 * Ambil profile dari user yang sedang login.
 * `cache()` memastikan satu kali query per request.
 */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[getCurrentProfile] supabase error:", error.message);
    return null;
  }
  return (data as Profile | null) ?? null;
});

/**
 * Ambil business untuk user yang sedang login (single-tenant MVP).
 */
export const getCurrentBusiness = cache(
  async (): Promise<Business | null> => {
    const supabase = await createClient();
    const profile = await getCurrentProfile();
    if (!profile?.business_id) return null;

    const { data, error } = await supabase
      .from("businesses")
      .select("*")
      .eq("id", profile.business_id)
      .maybeSingle();

    if (error) {
      console.error("[getCurrentBusiness] supabase error:", error.message);
      return null;
    }
    return (data as Business | null) ?? null;
  },
);

/**
 * Helper convenience: business_id atau null.
 */
export async function getCurrentBusinessId(): Promise<string | null> {
  const profile = await getCurrentProfile();
  return profile?.business_id ?? null;
}

/**
 * Email user yang sedang login (atau null kalau belum auth). Dipakai
 * untuk display read-only di /settings.
 */
export const getCurrentUserEmail = cache(
  async (): Promise<string | null> => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.email ?? null;
  },
);
