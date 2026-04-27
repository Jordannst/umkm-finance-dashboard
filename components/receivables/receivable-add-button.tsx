"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ReceivableForm } from "@/components/receivables/receivable-form";
import type { Category } from "@/types/finance";

interface ReceivableAddButtonProps {
  categories: Category[];
}

export function ReceivableAddButton({ categories }: ReceivableAddButtonProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Tambah Piutang
      </Button>
      {open && (
        <ReceivableForm
          open={open}
          onOpenChange={setOpen}
          categories={categories}
        />
      )}
    </>
  );
}
