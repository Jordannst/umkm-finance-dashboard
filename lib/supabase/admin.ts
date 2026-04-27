import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase admin client (service role).
 * BYPASS Row Level Security. WAJIB server-only.
 *
 * Gunakan HANYA untuk:
 * - Endpoint /api/liana/* yang sudah diverifikasi shared secret
 * - Background job/seed/migration script
 *
 * Jangan pernah dipanggil dari Client Component / browser.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase service role tidak tersedia. Pastikan NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY sudah diset.",
    );
  }

  return createSupabaseClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
