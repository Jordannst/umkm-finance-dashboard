import Link from "next/link";
import { Wallet, AlertCircle } from "lucide-react";

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
import type { Receivable, ReceivableStatus } from "@/types/finance";

interface ActiveReceivablesProps {
  receivables: Receivable[];
  /** YYYY-MM-DD untuk hitung overdue. Default: hari ini di TZ Jakarta (di server). */
  todayRef: string;
}

const statusMeta: Record<
  ReceivableStatus,
  { label: string; variant: "secondary" | "warning" | "success" }
> = {
  unpaid: { label: "Belum bayar", variant: "secondary" },
  partial: { label: "Bayar sebagian", variant: "warning" },
  paid: { label: "Lunas", variant: "success" },
};

export function ActiveReceivables({
  receivables,
  todayRef,
}: ActiveReceivablesProps) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle>Piutang aktif</CardTitle>
          <CardDescription>
            5 piutang teratas yang belum lunas.
          </CardDescription>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/receivables">Lihat semua</Link>
        </Button>
      </CardHeader>
      <CardContent className="flex-1">
        {receivables.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="Tidak ada piutang aktif"
            description="Semua pelanggan sudah lunas. Tambah piutang baru kalau ada pesanan tempo."
          />
        ) : (
          <ul className="divide-y">
            {receivables.map((rc) => {
              const remaining = Number(rc.amount) - Number(rc.paid_amount);
              const meta = statusMeta[rc.status];
              const overdue =
                rc.due_date && rc.due_date < todayRef && rc.status !== "paid";
              return (
                <li
                  key={rc.id}
                  className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-warning/15 text-warning">
                    <Wallet className="h-4 w-4" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {rc.customer_name}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                      {rc.due_date && (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1",
                            overdue && "text-destructive",
                          )}
                        >
                          {overdue && (
                            <AlertCircle className="h-3 w-3" aria-hidden />
                          )}
                          Jatuh tempo {formatDate(rc.due_date)}
                        </span>
                      )}
                      {rc.note && (
                        <span className="truncate">· {rc.note}</span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums text-warning">
                      {formatRupiah(remaining)}
                    </p>
                    {Number(rc.paid_amount) > 0 && (
                      <p className="text-xs text-muted-foreground tabular-nums">
                        dari {formatRupiah(Number(rc.amount))}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
