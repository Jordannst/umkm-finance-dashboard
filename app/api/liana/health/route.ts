import { apiOk } from "@/lib/api/responses";

export const dynamic = "force-dynamic";

/**
 * GET /api/liana/health
 *
 * Healthcheck publik — sengaja TIDAK pakai shared secret. Liana boleh
 * panggil sebelum kirim data untuk memastikan endpoint hidup. Tidak
 * mengembalikan data sensitif.
 */
export async function GET() {
  return apiOk({
    status: "ok",
    service: "umkm-finance-dashboard",
    server_time: new Date().toISOString(),
    version: "sprint-6",
  });
}
