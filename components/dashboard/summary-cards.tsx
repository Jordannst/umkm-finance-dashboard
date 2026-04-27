import { ArrowDownRight, ArrowUpRight, TrendingUp, Wallet } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatRupiah } from "@/lib/finance/format";
import type { FinanceSummary } from "@/types/finance";

interface SummaryCardsProps {
  summary: FinanceSummary;
}

export function SummaryCards({ summary }: SummaryCardsProps) {
  const cards = [
    {
      label: "Pemasukan hari ini",
      value: summary.total_income,
      hint: "Termasuk pembayaran piutang",
      icon: ArrowUpRight,
      accent: "text-success",
    },
    {
      label: "Pengeluaran hari ini",
      value: summary.total_expense,
      hint: "Belanja dan operasional",
      icon: ArrowDownRight,
      accent: "text-destructive",
    },
    {
      label: "Laba sederhana",
      value: summary.profit,
      hint:
        summary.profit >= 0
          ? "Selisih pemasukan dikurangi pengeluaran"
          : "Pengeluaran lebih besar dari pemasukan",
      icon: TrendingUp,
      accent: summary.profit >= 0 ? "text-success" : "text-destructive",
    },
    {
      label: "Piutang aktif",
      value: summary.active_receivables,
      hint: "Belum termasuk pemasukan",
      icon: Wallet,
      accent: "text-warning",
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
                {formatRupiah(card.value)}
              </div>
              <CardDescription className="mt-1">{card.hint}</CardDescription>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
