import { verifyLianaAuth } from "@/lib/api/liana-auth";
import { apiError, apiOk } from "@/lib/api/responses";
import { withTiming, withTimingSync } from "@/lib/api/instrument";
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
  const startTotal = Date.now();
  console.log(`[api] route=/api/liana/recap start`);

  const { result: authError, durationMs: authMs } = withTimingSync(() =>
    verifyLianaAuth(request),
  );
  if (authError) {
    console.log(
      `[api] route=/api/liana/recap auth_ms=${authMs} total_ms=${Date.now() - startTotal} status=401`,
    );
    return authError;
  }

  const url = new URL(request.url);
  const businessId = url.searchParams.get("business_id");
  const periodParam = url.searchParams.get("period");

  if (!businessId) {
    console.log(
      `[api] route=/api/liana/recap auth_ms=${authMs} total_ms=${Date.now() - startTotal} status=400 reason=missing_business_id`,
    );
    return apiError(
      "missing_business_id",
      "Query string `business_id` wajib diisi.",
      400,
    );
  }
  if (!/^[0-9a-f-]{36}$/i.test(businessId)) {
    console.log(
      `[api] route=/api/liana/recap auth_ms=${authMs} total_ms=${Date.now() - startTotal} status=400 reason=invalid_business_id`,
    );
    return apiError(
      "invalid_business_id",
      "business_id bukan UUID valid.",
      400,
    );
  }

  const { result: exists, durationMs: existsMs } = await withTiming(() =>
    ensureBusinessExists(businessId),
  );
  if (!exists) {
    console.log(
      `[api] route=/api/liana/recap auth_ms=${authMs} db_ms=${existsMs} total_ms=${Date.now() - startTotal} status=404`,
    );
    return apiError(
      "business_not_found",
      "business_id tidak ditemukan.",
      404,
    );
  }

  const period = resolveLianaRecapPeriod(periodParam);
  const { result: recap, durationMs: recapMs } = await withTiming(() =>
    getLianaRecap(businessId, period),
  );

  const totalMs = Date.now() - startTotal;
  console.log(
    `[api] route=/api/liana/recap auth_ms=${authMs} db_ms=${existsMs + recapMs} total_ms=${totalMs} status=200`,
  );
  return apiOk(recap);
}
