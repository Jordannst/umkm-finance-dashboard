import { AlertCircle, Wallet } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { ReceivableRowActions } from "@/components/receivables/receivable-row-actions";
import { formatDate, formatRupiah } from "@/lib/finance/format";
import { cn } from "@/lib/utils";
import type {
  Category,
  Receivable,
  ReceivableStatus,
} from "@/types/finance";

interface ReceivableTableProps {
  receivables: Receivable[];
  categories: Category[];
  defaultDate: string;
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

export function ReceivableTable({
  receivables,
  categories,
  defaultDate,
  todayRef,
}: ReceivableTableProps) {
  if (receivables.length === 0) {
    return (
      <EmptyState
        icon={Wallet}
        title="Tidak ada piutang"
        description="Coba ubah filter, atau tambah piutang baru lewat tombol di pojok kanan atas."
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Pelanggan</TableHead>
            <TableHead className="hidden md:table-cell">Kategori</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden lg:table-cell">
              Jatuh tempo
            </TableHead>
            <TableHead className="text-right">Sisa / Total</TableHead>
            <TableHead className="w-12" aria-label="Aksi" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {receivables.map((rc) => {
            const total = Number(rc.amount);
            const paid = Number(rc.paid_amount);
            const remaining = total - paid;
            const meta = statusMeta[rc.status];
            const overdue =
              rc.due_date && rc.due_date < todayRef && rc.status !== "paid";
            const progress = total === 0 ? 0 : Math.min(100, (paid / total) * 100);
            return (
              <TableRow key={rc.id}>
                <TableCell>
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">{rc.customer_name}</p>
                    {rc.note && (
                      <p className="line-clamp-1 max-w-xs text-xs text-muted-foreground">
                        {rc.note}
                      </p>
                    )}
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {rc.category_name ? (
                    <Badge variant="outline" className="capitalize">
                      {rc.category_name}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="space-y-1.5">
                    <Badge variant={meta.variant}>{meta.label}</Badge>
                    {paid > 0 && rc.status !== "paid" && (
                      <div
                        className="h-1 w-24 overflow-hidden rounded-full bg-muted"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(progress)}
                      >
                        <div
                          className="h-full bg-warning"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  {rc.due_date ? (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 text-sm",
                        overdue && "text-destructive",
                      )}
                    >
                      {overdue && (
                        <AlertCircle className="h-3.5 w-3.5" aria-hidden />
                      )}
                      {formatDate(rc.due_date)}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <p
                    className={cn(
                      "text-sm font-semibold tabular-nums",
                      rc.status === "paid"
                        ? "text-success"
                        : "text-warning",
                    )}
                  >
                    {formatRupiah(rc.status === "paid" ? total : remaining)}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {rc.status === "paid"
                      ? "Lunas"
                      : `dari ${formatRupiah(total)}`}
                  </p>
                </TableCell>
                <TableCell className="text-right">
                  <ReceivableRowActions
                    receivable={rc}
                    categories={categories}
                    defaultDate={defaultDate}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
