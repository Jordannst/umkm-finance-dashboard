"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TransactionForm } from "@/components/transactions/transaction-form";
import type { Category } from "@/types/finance";

interface TransactionAddButtonProps {
  categories: Category[];
  defaultDate: string;
}

export function TransactionAddButton({
  categories,
  defaultDate,
}: TransactionAddButtonProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Tambah Transaksi
      </Button>
      {/* Conditional mount: form unmount saat dialog ditutup,
          memastikan field dan state kembali ke default saat dibuka lagi. */}
      {open && (
        <TransactionForm
          open={open}
          onOpenChange={setOpen}
          categories={categories}
          defaultDate={defaultDate}
        />
      )}
    </>
  );
}
