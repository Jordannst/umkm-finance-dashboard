import { NextResponse } from "next/server";

import { getCurrentBusinessId } from "@/lib/finance/business";
import { transactionsToCsv } from "@/lib/finance/reports/csv";
import { resolvePeriod } from "@/lib/finance/reports/periods";
import { getReportTransactions } from "@/lib/finance/reports/queries";

export const dynamic = "force-dynamic";

/**
 * GET /api/reports/export?preset=7d  — atau ?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Auth: cookie session (sama dengan halaman dashboard). Tidak bisa diakses
 * tanpa login karena `getCurrentBusinessId` baca dari Supabase auth cookie.
 */
export async function GET(request: Request) {
  const businessId = await getCurrentBusinessId();
  if (!businessId) {
    return NextResponse.json(
      { error: "Tidak terautentikasi atau belum terhubung ke bisnis." },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const period = resolvePeriod({
    preset: url.searchParams.get("preset") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });

  const transactions = await getReportTransactions(
    businessId,
    period.from,
    period.to,
  );
  const csv = transactionsToCsv(transactions);

  const filename = `laporan-${period.from}_${period.to}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
