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
import { Textarea } from "@/components/ui/textarea";
import {
  recordPaymentAction,
  type PaymentFormState,
} from "@/lib/finance/receivables/actions";
import { formatRupiah } from "@/lib/finance/format";
import type { Receivable } from "@/types/finance";

const initialState: PaymentFormState = { ok: false };

interface ReceivablePaymentFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receivable: Receivable;
  /** Tanggal default pembayaran (YYYY-MM-DD di TZ Jakarta). */
  defaultDate: string;
}

export function ReceivablePaymentForm({
  open,
  onOpenChange,
  receivable,
  defaultDate,
}: ReceivablePaymentFormProps) {
  const [state, formAction, pending] = useActionState(
    recordPaymentAction,
    initialState,
  );

  const remaining =
    Number(receivable.amount) - Number(receivable.paid_amount);

  React.useEffect(() => {
    if (state.ok && state.message) {
      toast.success(state.message);
      onOpenChange(false);
    } else if (!state.ok && state.message) {
      toast.error(state.message);
    }
  }, [state, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Catat pembayaran</DialogTitle>
          <DialogDescription>
            Pelanggan: <strong>{receivable.customer_name}</strong>. Sisa
            piutang: <strong>{formatRupiah(remaining)}</strong>.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} noValidate className="space-y-4">
          <input
            type="hidden"
            name="receivable_id"
            value={receivable.id}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="payment-amount">Jumlah dibayar (Rp)</Label>
              <Input
                id="payment-amount"
                name="amount"
                type="text"
                inputMode="numeric"
                placeholder={String(Math.round(remaining))}
                defaultValue={String(Math.round(remaining))}
                required
                aria-invalid={Boolean(state.fieldErrors?.amount)}
              />
              <p className="text-xs text-muted-foreground">
                Maksimal {formatRupiah(remaining)}. Sebagian atau penuh.
              </p>
              {state.fieldErrors?.amount && (
                <p className="text-xs text-destructive">
                  {state.fieldErrors.amount}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment_date">Tanggal pembayaran</Label>
              <Input
                id="payment_date"
                name="payment_date"
                type="date"
                defaultValue={defaultDate}
                required
                aria-invalid={Boolean(state.fieldErrors?.payment_date)}
              />
              {state.fieldErrors?.payment_date && (
                <p className="text-xs text-destructive">
                  {state.fieldErrors.payment_date}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="payment-note">Catatan (opsional)</Label>
            <Textarea
              id="payment-note"
              name="note"
              placeholder="mis. transfer BCA"
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
              Catat pembayaran
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
