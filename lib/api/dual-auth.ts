import "server-only";

import { timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { apiError } from "@/lib/api/responses";
import { getCurrentBusinessId } from "@/lib/finance/business";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createSessionClient } from "@/lib/supabase/server";

/**
 * Hasil dari `resolveBusinessAuth()`. Caller route handler bisa cek
 * `.ok` lalu pakai `.businessId` + `.supabase` untuk semua query.
 *
 * - mode "session"  : user normal login dashboard, RLS aktif (defense-in-depth)
 * - mode "bearer"   : MCP / server-to-server, pakai admin client (RLS bypass)
 *                     SCOPED ke LIANA_BUSINESS_ID dari env — tidak bisa
 *                     cross-business walaupun penyerang punya secret.
 */
export type BusinessAuthSuccess = {
  ok: true;
  businessId: string;
  supabase: SupabaseClient;
  mode: "session" | "bearer";
};

export type BusinessAuthFailure = {
  ok: false;
  response: Response;
};

export type BusinessAuthResult = BusinessAuthSuccess | BusinessAuthFailure;

/**
 * Resolve businessId untuk request inbound — coba bearer dulu, fallback
 * ke session. Dipakai di route handler yang harus support dual mode:
 *
 * - Dashboard UI (browser session) — flow existing
 * - MCP server-to-server (Liana) dengan LIANA_SHARED_SECRET
 *
 * Return value sama-sama menyediakan `businessId` + `supabase` client.
 * Caller tidak perlu tau dari mode mana auth-nya datang — RLS dihandle
 * via client yang berbeda (admin vs session).
 *
 * Bearer mode konfigurasi via 2 env:
 *   LIANA_SHARED_SECRET — secret string, harus identik dengan yang di MCP
 *   LIANA_BUSINESS_ID   — UUID business yang scope-nya di-allow untuk bearer
 *
 * Kalau header Authorization Bearer ada tapi mismatch → 401 (jangan lanjut
 * ke session check, supaya secret yang typo gak fallback ke perilaku session).
 */
export async function resolveBusinessAuth(
  request: Request,
): Promise<BusinessAuthResult> {
  const authHeader = request.headers.get("authorization") ?? "";
  const bearerMatch = /^Bearer\s+(.+)$/i.exec(authHeader);

  // Path bearer: ada header Authorization Bearer.
  if (bearerMatch) {
    const presented = bearerMatch[1].trim();
    const expected = process.env.LIANA_SHARED_SECRET;
    if (!expected || expected.trim() === "") {
      console.error(
        "[resolveBusinessAuth] LIANA_SHARED_SECRET tidak diset; bearer DITOLAK.",
      );
      return {
        ok: false,
        response: apiError(
          "server_misconfigured",
          "Bearer auth belum dikonfigurasi di server.",
          503,
        ),
      };
    }
    const businessId = process.env.LIANA_BUSINESS_ID?.trim();
    if (!businessId) {
      console.error(
        "[resolveBusinessAuth] LIANA_BUSINESS_ID tidak diset; bearer DITOLAK.",
      );
      return {
        ok: false,
        response: apiError(
          "server_misconfigured",
          "LIANA_BUSINESS_ID belum di-set di server.",
          503,
        ),
      };
    }

    // Timing-safe compare.
    const a = Buffer.from(expected);
    const b = Buffer.from(presented);
    if (a.length !== b.length || !safeEqual(a, b)) {
      return {
        ok: false,
        response: apiError("unauthorized", "Bearer secret tidak valid.", 401),
      };
    }

    return {
      ok: true,
      businessId,
      supabase: createAdminClient(),
      mode: "bearer",
    };
  }

  // Path session: dashboard user login normal.
  const businessId = await getCurrentBusinessId();
  if (!businessId) {
    return {
      ok: false,
      response: apiError(
        "no_business",
        "Akun belum terhubung ke bisnis manapun.",
        412,
      ),
    };
  }
  const supabase = await createSessionClient();
  return {
    ok: true,
    businessId,
    supabase,
    mode: "session",
  };
}

function safeEqual(a: Buffer, b: Buffer): boolean {
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
