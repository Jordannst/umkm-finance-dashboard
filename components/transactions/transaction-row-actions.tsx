"use client";

import * as React from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { TransactionForm } from "@/components/transactions/transaction-form";
import { deleteTransactionAction } from "@/lib/finance/transactions/actions";
import type { Category, Transaction } from "@/types/finance";

interface TransactionRowActionsProps {
  transaction: Transaction;
  categories: Category[];
  defaultDate: string;
}

export function TransactionRowActions({
  transaction,
  categories,
  defaultDate,
}: TransactionRowActionsProps) {
  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  async function handleDelete() {
    const fd = new FormData();
    fd.set("id", transaction.id);
    const result = await deleteTransactionAction(fd);
    if (result.ok) {
      toast.success("Transaksi dihapus.");
    } else {
      toast.error(result.message ?? "Gagal menghapus transaksi.");
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Aksi transaksi">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
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

      {/* Edit form */}
      {editOpen && (transaction.type === "income" || transaction.type === "expense") && (
        <TransactionForm
          open={editOpen}
          onOpenChange={setEditOpen}
          transaction={transaction}
          categories={categories}
          defaultDate={defaultDate}
        />
      )}

      {/* Confirm delete */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Hapus transaksi?"
        description="Transaksi akan disembunyikan (soft delete). Hubungi admin kalau perlu dipulihkan."
        confirmLabel="Ya, hapus"
        cancelLabel="Batal"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </>
  );
}
