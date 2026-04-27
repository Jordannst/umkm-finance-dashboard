"use client";

import * as React from "react";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createTransactionAction,
  updateTransactionAction,
  type TransactionFormState,
} from "@/lib/finance/transactions/actions";
import { cn } from "@/lib/utils";
import type { Category, Transaction } from "@/types/finance";

const initialState: TransactionFormState = { ok: false };

interface TransactionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** undefined = mode tambah, Transaction = mode edit */
  transaction?: Transaction;
  /**
   * Semua kategori untuk business saat ini, sudah di-fetch di Server.
   * Akan di-filter berdasarkan tipe income/expense yang dipilih user.
   */
  categories: Category[];
  /** Tanggal default untuk transaksi baru, YYYY-MM-DD di TZ Jakarta. */
  defaultDate: string;
}

export function TransactionForm({
  open,
  onOpenChange,
  transaction,
  categories,
  defaultDate,
}: TransactionFormProps) {
  const isEdit = Boolean(transaction);
  const action = isEdit ? updateTransactionAction : createTransactionAction;
  const [state, formAction, pending] = useActionState(action, initialState);

  // Type yang dipilih dijadikan state lokal supaya category dropdown
  // bisa difilter realtime. Initial value diambil dari prop saat mount.
  // Parent harus melakukan conditional mount (`{open && <TransactionForm/>}`)
  // agar state direset otomatis setiap kali dialog dibuka.
  const [type, setType] = React.useState<"income" | "expense">(
    transaction?.type === "expense" ? "expense" : "income",
  );

  // Tutup dialog dan tampilkan toast saat action sukses.
  React.useEffect(() => {
    if (state.ok && state.message) {
      toast.success(state.message);
      onOpenChange(false);
    } else if (!state.ok && state.message) {
      toast.error(state.message);
    }
  }, [state, onOpenChange]);

  const filteredCategories = categories.filter(
    (c) => c.type === (type === "income" ? "income" : "expense"),
  );

  // Default amount pakai integer rapi (bukan "120000.00")
  const defaultAmount = transaction
    ? String(Math.round(Number(transaction.amount)))
    : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit transaksi" : "Tambah transaksi"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Perbarui detail transaksi. Pembayaran piutang dikelola dari halaman Piutang."
              : "Catat pemasukan atau pengeluaran. Pembayaran piutang dikelola dari halaman Piutang."}
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} noValidate className="space-y-4">
          {transaction && (
            <input type="hidden" name="id" value={transaction.id} />
          )}

          {/* Type toggle */}
          <div className="space-y-2">
            <Label>Tipe transaksi</Label>
            <div className="grid grid-cols-2 gap-2">
              <TypePill
                active={type === "income"}
                onClick={() => setType("income")}
                label="Pemasukan"
                tone="success"
              />
              <TypePill
                active={type === "expense"}
                onClick={() => setType("expense")}
                label="Pengeluaran"
                tone="destructive"
              />
            </div>
            <input type="hidden" name="type" value={type} />
            {state.fieldErrors?.type && (
              <p className="text-xs text-destructive">
                {state.fieldErrors.type}
              </p>
            )}
          </div>

          {/* Amount + Date */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="amount">Jumlah (Rp)</Label>
              <Input
                id="amount"
                name="amount"
                type="text"
                inputMode="numeric"
                placeholder="120000"
                defaultValue={defaultAmount}
                required
                aria-invalid={Boolean(state.fieldErrors?.amount)}
              />
              {state.fieldErrors?.amount && (
                <p className="text-xs text-destructive">
                  {state.fieldErrors.amount}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="transaction_date">Tanggal</Label>
              <Input
                id="transaction_date"
                name="transaction_date"
                type="date"
                defaultValue={
                  transaction?.transaction_date ?? defaultDate
                }
                required
                aria-invalid={Boolean(state.fieldErrors?.transaction_date)}
              />
              {state.fieldErrors?.transaction_date && (
                <p className="text-xs text-destructive">
                  {state.fieldErrors.transaction_date}
                </p>
              )}
            </div>
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label htmlFor="category_id">Kategori</Label>
            <Select
              name="category_id"
              defaultValue={transaction?.category_id ?? undefined}
            >
              <SelectTrigger id="category_id">
                <SelectValue placeholder="Pilih kategori (opsional)" />
              </SelectTrigger>
              <SelectContent>
                {filteredCategories.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    Tidak ada kategori. Tambah dari halaman Pengaturan.
                  </div>
                ) : (
                  filteredCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Note */}
          <div className="space-y-2">
            <Label htmlFor="note">Catatan (opsional)</Label>
            <Textarea
              id="note"
              name="note"
              placeholder="Contoh: jual kopi susu 4 cup"
              defaultValue={transaction?.note ?? ""}
              rows={2}
              aria-invalid={Boolean(state.fieldErrors?.note)}
            />
            {state.fieldErrors?.note && (
              <p className="text-xs text-destructive">
                {state.fieldErrors.note}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Batal
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? "Simpan perubahan" : "Tambah transaksi"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface TypePillProps {
  active: boolean;
  onClick: () => void;
  label: string;
  tone: "success" | "destructive";
}

function TypePill({ active, onClick, label, tone }: TypePillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border px-3 py-2 text-sm font-medium transition-colors",
        active
          ? tone === "success"
            ? "border-success bg-success/10 text-success"
            : "border-destructive bg-destructive/10 text-destructive"
          : "border-input bg-background text-muted-foreground hover:bg-muted",
      )}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}
