import { type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

/**
 * Next.js 16 menggantikan middleware.ts dengan proxy.ts.
 * - Named export `proxy`
 * - Tidak ada edge runtime di proxy
 *
 * Fungsi ini me-refresh session Supabase di setiap request, dan menjaga
 * supaya halaman terlindungi me-redirect ke /login bila belum auth.
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Cocokkan semua path KECUALI:
     * - _next (assets internal Next)
     * - file statis (svg, png, jpg, jpeg, gif, webp, ico)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
