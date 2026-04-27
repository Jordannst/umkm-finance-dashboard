import { verifyLianaAuth } from "@/lib/api/liana-auth";
import { apiError, apiOk } from "@/lib/api/responses";
import {
  ensureBusinessExists,
  getLianaRecap,
  resolveLianaRecapPeriod,
} from "@/lib/finance/liana/queries";

export const dynamic = "force-dynamic";

/**
 * GET /api/liana/recap?business_id=...&period=today|week|month
 *
 * Liana panggil ini untuk balas pertanyaan user seperti "rekap hari ini"
 * atau "berapa pemasukan minggu ini".
 *
 * Default period: today.
 */
export async function GET(request: Request) {
  const authError = verifyLianaAuth(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const businessId = url.searchParams.get("business_id");
  const periodParam = url.searchParams.get("period");

  if (!businessId) {
    return apiError(
      "missing_business_id",
      "Query string `business_id` wajib diisi.",
      400,
    );
  }
  if (!/^[0-9a-f-]{36}$/i.test(businessId)) {
    return apiError(
      "invalid_business_id",
      "business_id bukan UUID valid.",
      400,
    );
  }

  const exists = await ensureBusinessExists(businessId);
  if (!exists) {
    return apiError(
      "business_not_found",
      "business_id tidak ditemukan.",
      404,
    );
  }

  const period = resolveLianaRecapPeriod(periodParam);
  const recap = await getLianaRecap(businessId, period);

  return apiOk(recap);
}
