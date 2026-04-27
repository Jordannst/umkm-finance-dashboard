import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Helper untuk proxy.ts (Next 16 pengganti middleware.ts).
 * - Refresh session Supabase via cookie
 * - Redirect (app)/* ke /login jika belum auth
 * - Redirect /login & /signup ke /dashboard jika sudah auth
 *
 * IMPORTANT: pengembalian harus selalu `supabaseResponse` agar cookie
 * yang di-refresh ikut terkirim ke browser.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // PENTING: jangan jalankan code lain antara createServerClient dan getUser.
  // getUser() melakukan revalidasi token; jika dilewatkan, session bisa
  // expired di server tapi masih valid di client.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  const isAuthRoute = pathname === "/login" || pathname === "/signup";
  const isApiAuthRoute = pathname.startsWith("/auth/");
  const isLianaApi = pathname.startsWith("/api/liana/");
  const isPublicAsset =
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname === "/";

  // Endpoint Liana pakai shared secret server-side, bukan session user.
  if (isLianaApi || isApiAuthRoute || isPublicAsset) {
    return supabaseResponse;
  }

  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
