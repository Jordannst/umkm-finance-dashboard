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
  createReceivableAction,
  updateReceivableAction,
  type ReceivableFormState,
} from "@/lib/finance/receivables/actions";
import { formatRupiah } from "@/lib/finance/format";
import type { Category, Receivable } from "@/types/finance";

const initialState: ReceivableFormState = { ok: false };

interface ReceivableFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receivable?: Receivable;
  /** Hanya kategori type='receivable' yang relevan di form ini. */
  categories: Category[];
}

export function ReceivableForm({
  open,
  onOpenChange,
  receivable,
  categories,
}: ReceivableFormProps) {
  const isEdit = Boolean(receivable);
  const action = isEdit ? updateReceivableAction : createReceivableAction;
  const [state, formAction, pending] = useActionState(action, initialState);

  React.useEffect(() => {
    if (state.ok && state.message) {
      toast.success(state.message);
      onOpenChange(false);
    } else if (!state.ok && state.message) {
      toast.error(state.message);
    }
  }, [state, onOpenChange]);

  const defaultAmount = receivable
    ? String(Math.round(Number(receivable.amount)))
    : "";

  const paidAmount = receivable ? Number(receivable.paid_amount) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit piutang" : "Tambah piutang"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Perbarui detail piutang. Pembayaran dikelola dari aksi 'Bayar Sebagian' atau 'Tandai Lunas'."
              : "Catat pelanggan yang belum bayar. Piutang baru tidak masuk pemasukan sampai pelunasan."}
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} noValidate className="space-y-4">
          {receivable && <input type="hidden" name="id" value={receivable.id} />}

          <div className="space-y-2">
            <Label htmlFor="customer_name">Nama pelanggan</Label>
            <Input
              id="customer_name"
              name="customer_name"
              type="text"
              placeholder="mis. Budi Santoso"
              defaultValue={receivable?.customer_name ?? ""}
              required
              aria-invalid={Boolean(state.fieldErrors?.customer_name)}
            />
            {state.fieldErrors?.customer_name && (
              <p className="text-xs text-destructive">
                {state.fieldErrors.customer_name}
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="amount">Jumlah piutang (Rp)</Label>
              <Input
                id="amount"
                name="amount"
                type="text"
                inputMode="numeric"
                placeholder="200000"
                defaultValue={defaultAmount}
                required
                aria-invalid={Boolean(state.fieldErrors?.amount)}
              />
              {paidAmount > 0 && (
                <p className="text-xs text-muted-foreground">
                  Sudah dibayar {formatRupiah(paidAmount)}. Jumlah baru
                  tidak boleh kurang dari ini.
                </p>
              )}
              {state.fieldErrors?.amount && (
                <p className="text-xs text-destructive">
                  {state.fieldErrors.amount}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="due_date">Jatuh tempo (opsional)</Label>
              <Input
                id="due_date"
                name="due_date"
                type="date"
                defaultValue={receivable?.due_date ?? ""}
                aria-invalid={Boolean(state.fieldErrors?.due_date)}
              />
              {state.fieldErrors?.due_date && (
                <p className="text-xs text-destructive">
                  {state.fieldErrors.due_date}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="category_id">Kategori (opsional)</Label>
            <Select
              name="category_id"
              defaultValue={receivable?.category_id ?? undefined}
            >
              <SelectTrigger id="category_id">
                <SelectValue placeholder="Pilih kategori piutang" />
              </SelectTrigger>
              <SelectContent>
                {categories.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    Tidak ada kategori. Tambah dari halaman Pengaturan.
                  </div>
                ) : (
                  categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="note">Catatan (opsional)</Label>
            <Textarea
              id="note"
              name="note"
              placeholder="mis. pesanan kantor 4 dus kopi"
              defaultValue={receivable?.note ?? ""}
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
              {isEdit ? "Simpan perubahan" : "Tambah piutang"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
