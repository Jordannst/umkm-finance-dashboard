import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Receipt } from "lucide-react";

import { SourceBadge } from "@/components/liana/source-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDate, formatRupiah } from "@/lib/finance/format";
import { cn } from "@/lib/utils";
import type { Transaction, TransactionType } from "@/types/finance";

interface RecentTransactionsProps {
  transactions: Transaction[];
}

const typeMeta: Record<
  TransactionType,
  { label: string; sign: "+" | "-"; tone: string; badge: string }
> = {
  income: {
    label: "Pemasukan",
    sign: "+",
    tone: "text-success",
    badge: "bg-success/10 text-success",
  },
  receivable_payment: {
    label: "Pelunasan piutang",
    sign: "+",
    tone: "text-success",
    badge: "bg-success/10 text-success",
  },
  expense: {
    label: "Pengeluaran",
    sign: "-",
    tone: "text-destructive",
    badge: "bg-destructive/10 text-destructive",
  },
};

export function RecentTransactions({ transactions }: RecentTransactionsProps) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle>Transaksi terbaru</CardTitle>
          <CardDescription>5 transaksi paling baru.</CardDescription>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/transactions">Lihat semua</Link>
        </Button>
      </CardHeader>
      <CardContent className="flex-1">
        {transactions.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Belum ada transaksi"
            description="Tambah pemasukan atau pengeluaran lewat halaman Transaksi atau via Liana."
          />
        ) : (
          <ul className="divide-y">
            {transactions.map((tx) => {
              const meta = typeMeta[tx.type];
              const Icon = tx.type === "expense" ? ArrowDownRight : ArrowUpRight;
              return (
                <li key={tx.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <div
                    className={cn(
                      "grid h-9 w-9 shrink-0 place-items-center rounded-full",
                      meta.badge,
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {tx.note?.trim() || tx.category_name || meta.label}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <Badge variant="outline" className="border-transparent bg-muted/60 text-muted-foreground">
                        {tx.category_name ?? meta.label}
                      </Badge>
                      <span>·</span>
                      <span>{formatDate(tx.transaction_date)}</span>
                      {tx.source === "chat" && (
                        <SourceBadge source="chat" iconOnly className="ml-1" />
                      )}
                    </div>
                  </div>
                  <p className={cn("shrink-0 text-sm font-semibold tabular-nums", meta.tone)}>
                    {meta.sign}
                    {formatRupiah(Number(tx.amount))}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
