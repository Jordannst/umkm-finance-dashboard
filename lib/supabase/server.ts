import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client untuk Server Components, Route Handlers, dan
 * Server Actions. Cookie session diatur lewat next/headers.
 *
 * Catatan Next.js 16: `cookies()` adalah Promise, harus di-await.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Dipanggil dari Server Component yang tidak boleh set cookie.
            // Aman diabaikan jika middleware/proxy yang merefresh session.
          }
        },
      },
    },
  );
}
