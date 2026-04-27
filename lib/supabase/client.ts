"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client untuk Client Components / browser.
 * Membaca cookie session via cookies API standar browser.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
