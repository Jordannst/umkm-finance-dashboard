"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ProductForm } from "@/components/products/product-form";

interface ProductAddButtonProps {
  /** Existing categories untuk autocomplete suggest di form. */
  knownCategories?: string[];
}

export function ProductAddButton({ knownCategories }: ProductAddButtonProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Tambah Produk
      </Button>
      {/* Conditional mount supaya state form ke-reset setiap dibuka. */}
      {open && (
        <ProductForm
          open={open}
          onOpenChange={setOpen}
          knownCategories={knownCategories}
        />
      )}
    </>
  );
}
