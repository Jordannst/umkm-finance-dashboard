import { Receipt } from "lucide-react";

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
import { TransactionRowActions } from "@/components/transactions/transaction-row-actions";
import { formatDate, formatRupiah } from "@/lib/finance/format";
import { cn } from "@/lib/utils";
import type { Category, Transaction, TransactionType } from "@/types/finance";

interface TransactionTableProps {
  transactions: Transaction[];
  categories: Category[];
  defaultDate: string;
}

const typeMeta: Record<
  TransactionType,
  { label: string; tone: string; sign: "+" | "-"; badge: "success" | "destructive" | "secondary" }
> = {
  income: {
    label: "Pemasukan",
    tone: "text-success",
    sign: "+",
    badge: "success",
  },
  receivable_payment: {
    label: "Pelunasan",
    tone: "text-success",
    sign: "+",
    badge: "secondary",
  },
  expense: {
    label: "Pengeluaran",
    tone: "text-destructive",
    sign: "-",
    badge: "destructive",
  },
};

export function TransactionTable({
  transactions,
  categories,
  defaultDate,
}: TransactionTableProps) {
  if (transactions.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title="Belum ada transaksi"
        description="Coba ubah filter, atau tambah transaksi baru lewat tombol di pojok kanan atas."
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-32">Tanggal</TableHead>
            <TableHead className="w-32">Tipe</TableHead>
            <TableHead>Catatan & Kategori</TableHead>
            <TableHead className="hidden md:table-cell">Sumber</TableHead>
            <TableHead className="text-right">Jumlah</TableHead>
            <TableHead className="w-12" aria-label="Aksi" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map((tx) => {
            const meta = typeMeta[tx.type];
            return (
              <TableRow key={tx.id}>
                <TableCell className="whitespace-nowrap text-sm tabular-nums">
                  {formatDate(tx.transaction_date)}
                </TableCell>
                <TableCell>
                  <Badge variant={meta.badge}>{meta.label}</Badge>
                </TableCell>
                <TableCell>
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">
                      {tx.note?.trim() || tx.category_name || meta.label}
                    </p>
                    {tx.category_name && (
                      <p className="text-xs text-muted-foreground">
                        {tx.category_name}
                      </p>
                    )}
                  </div>
                </TableCell>
                <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                  <Badge variant="outline" className="capitalize">
                    {tx.source}
                  </Badge>
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right text-sm font-semibold tabular-nums",
                    meta.tone,
                  )}
                >
                  {meta.sign}
                  {formatRupiah(Number(tx.amount))}
                </TableCell>
                <TableCell className="text-right">
                  {tx.type === "receivable_payment" ? (
                    <span className="text-xs text-muted-foreground">
                      Lihat di Piutang
                    </span>
                  ) : (
                    <TransactionRowActions
                      transaction={tx}
                      categories={categories}
                      defaultDate={defaultDate}
                    />
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
