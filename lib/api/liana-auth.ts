import "server-only";

import { timingSafeEqual } from "node:crypto";

import { apiError } from "@/lib/api/responses";

/**
 * Cek `Authorization: Bearer <LIANA_SHARED_SECRET>` dengan timing-safe
 * compare. Return null kalau valid; return Response 401/500 kalau tidak.
 *
 * Pakai di tiap handler endpoint /api/liana/* sebelum baca body.
 */
export function verifyLianaAuth(request: Request): Response | null {
  const expected = process.env.LIANA_SHARED_SECRET;
  if (!expected || expected.trim() === "") {
    // Server salah konfigurasi - lebih aman tolak semua request daripada
    // tidak sengaja meng-allow tanpa auth.
    console.error(
      "[liana-auth] LIANA_SHARED_SECRET tidak diset. Endpoint Liana DITOLAK.",
    );
    return apiError(
      "server_misconfigured",
      "Endpoint Liana tidak aktif: shared secret belum dikonfigurasi di server.",
      503,
    );
  }

  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) {
    return apiError(
      "unauthorized",
      "Header Authorization Bearer tidak ditemukan.",
      401,
    );
  }
  const presented = match[1].trim();

  // Timing-safe compare — pad ke panjang yang sama supaya tidak
  // membocorkan info panjang via timing perbandingan string biasa.
  const a = Buffer.from(expected);
  const b = Buffer.from(presented);
  if (a.length !== b.length) {
    return apiError("unauthorized", "Shared secret tidak valid.", 401);
  }
  let ok = false;
  try {
    ok = timingSafeEqual(a, b);
  } catch {
    ok = false;
  }
  if (!ok) {
    return apiError("unauthorized", "Shared secret tidak valid.", 401);
  }
  return null;
}
