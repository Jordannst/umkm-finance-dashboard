"use client";

import * as React from "react";
import {
  Banknote,
  CheckCircle2,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ReceivableForm } from "@/components/receivables/receivable-form";
import { ReceivablePaymentForm } from "@/components/receivables/receivable-payment-form";
import {
  deleteReceivableAction,
  markPaidAction,
} from "@/lib/finance/receivables/actions";
import { formatRupiah } from "@/lib/finance/format";
import type { Category, Receivable } from "@/types/finance";

interface ReceivableRowActionsProps {
  receivable: Receivable;
  categories: Category[];
  defaultDate: string;
}

export function ReceivableRowActions({
  receivable,
  categories,
  defaultDate,
}: ReceivableRowActionsProps) {
  const [editOpen, setEditOpen] = React.useState(false);
  const [payOpen, setPayOpen] = React.useState(false);
  const [markPaidOpen, setMarkPaidOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  const remaining =
    Number(receivable.amount) - Number(receivable.paid_amount);
  const isPaid = receivable.status === "paid";

  async function handleMarkPaid() {
    const fd = new FormData();
    fd.set("id", receivable.id);
    const result = await markPaidAction(fd);
    if (result.ok) {
      toast.success("Piutang ditandai lunas.");
    } else {
      toast.error(result.message ?? "Gagal menandai lunas.");
    }
  }

  async function handleDelete() {
    const fd = new FormData();
    fd.set("id", receivable.id);
    const result = await deleteReceivableAction(fd);
    if (result.ok) {
      toast.success("Piutang dihapus.");
    } else {
      toast.error(result.message ?? "Gagal menghapus piutang.");
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Aksi piutang">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {!isPaid && (
            <>
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  setPayOpen(true);
                }}
              >
                <Banknote className="h-4 w-4" />
                Bayar sebagian
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  setMarkPaidOpen(true);
                }}
                className="text-success focus:text-success"
              >
                <CheckCircle2 className="h-4 w-4" />
                Tandai lunas
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setEditOpen(true);
            }}
          >
            <Pencil className="h-4 w-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={(e) => {
              e.preventDefault();
              setDeleteOpen(true);
            }}
          >
            <Trash2 className="h-4 w-4" />
            Hapus
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Edit dialog */}
      {editOpen && (
        <ReceivableForm
          open={editOpen}
          onOpenChange={setEditOpen}
          receivable={receivable}
          categories={categories}
        />
      )}

      {/* Pay partial dialog */}
      {payOpen && !isPaid && (
        <ReceivablePaymentForm
          open={payOpen}
          onOpenChange={setPayOpen}
          receivable={receivable}
          defaultDate={defaultDate}
        />
      )}

      {/* Confirm mark paid */}
      <ConfirmDialog
        open={markPaidOpen}
        onOpenChange={setMarkPaidOpen}
        title="Tandai piutang lunas?"
        description={`Sisa ${formatRupiah(remaining)} akan tercatat sebagai pemasukan hari ini.`}
        confirmLabel="Ya, tandai lunas"
        onConfirm={handleMarkPaid}
      />

      {/* Confirm delete */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Hapus piutang?"
        description="Piutang akan disembunyikan (soft delete). Riwayat pembayaran tetap ada."
        confirmLabel="Ya, hapus"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </>
  );
}
