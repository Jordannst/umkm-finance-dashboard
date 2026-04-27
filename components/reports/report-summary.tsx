import {
  ArrowDownRight,
  ArrowUpRight,
  Receipt,
  TrendingUp,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatRupiah } from "@/lib/finance/format";
import type { ReportSummary as ReportSummaryData } from "@/lib/finance/reports/queries";

interface ReportSummaryProps {
  summary: ReportSummaryData;
  periodLabel: string;
  dayCount: number;
}

export function ReportSummary({
  summary,
  periodLabel,
  dayCount,
}: ReportSummaryProps) {
  const avgDailyProfit = dayCount > 0 ? summary.profit / dayCount : 0;

  const cards = [
    {
      label: "Total pemasukan",
      value: summary.total_income,
      hint: `${periodLabel}, termasuk pelunasan piutang`,
      icon: ArrowUpRight,
      accent: "text-success",
      isCurrency: true,
    },
    {
      label: "Total pengeluaran",
      value: summary.total_expense,
      hint: `${periodLabel}, belanja dan operasional`,
      icon: ArrowDownRight,
      accent: "text-destructive",
      isCurrency: true,
    },
    {
      label: "Laba periode",
      value: summary.profit,
      hint:
        dayCount > 1
          ? `Rata-rata ${formatRupiah(avgDailyProfit)} / hari`
          : "Selisih pemasukan dikurangi pengeluaran",
      icon: TrendingUp,
      accent: summary.profit >= 0 ? "text-success" : "text-destructive",
      isCurrency: true,
    },
    {
      label: "Jumlah transaksi",
      value: summary.transactions_count,
      hint: `${dayCount} hari dipantau`,
      icon: Receipt,
      accent: "text-foreground",
      isCurrency: false,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.label}
              </CardTitle>
              <Icon className={`h-4 w-4 ${card.accent}`} aria-hidden />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums">
                {card.isCurrency
                  ? formatRupiah(card.value)
                  : card.value.toLocaleString("id-ID")}
              </div>
              <CardDescription className="mt-1">{card.hint}</CardDescription>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
