"use client";

import * as React from "react";
import {
  Eye,
  EyeOff,
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
import { ProductForm } from "@/components/products/product-form";
import {
  deleteProductAction,
  toggleProductActiveAction,
} from "@/lib/sorea/products/actions";
import type { Product } from "@/types/sorea";

interface ProductRowActionsProps {
  product: Product;
  knownCategories?: string[];
}

export function ProductRowActions({
  product,
  knownCategories,
}: ProductRowActionsProps) {
  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  async function handleToggleActive() {
    const fd = new FormData();
    fd.set("id", product.id);
    fd.set("is_active", product.is_active ? "false" : "true");
    const result = await toggleProductActiveAction(fd);
    if (result.ok) {
      toast.success(
        product.is_active
          ? `"${product.name}" disembunyikan dari menu.`
          : `"${product.name}" ditampilkan kembali di menu.`,
      );
    } else {
      toast.error(result.message ?? "Gagal mengubah status produk.");
    }
  }

  async function handleDelete() {
    const fd = new FormData();
    fd.set("id", product.id);
    const result = await deleteProductAction(fd);
    if (result.ok) {
      toast.success(`Produk "${product.name}" dihapus.`);
    } else {
      toast.error(result.message ?? "Gagal menghapus produk.");
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Aksi produk">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
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
            onSelect={(e) => {
              e.preventDefault();
              void handleToggleActive();
            }}
          >
            {product.is_active ? (
              <>
                <EyeOff className="h-4 w-4" />
                Sembunyikan
              </>
            ) : (
              <>
                <Eye className="h-4 w-4" />
                Tampilkan
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
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

      {editOpen && (
        <ProductForm
          open={editOpen}
          onOpenChange={setEditOpen}
          product={product}
          knownCategories={knownCategories}
        />
      )}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Hapus produk?"
        description={`Produk "${product.name}" akan disembunyikan (soft delete). Order historis tetap menyimpan snapshot data.`}
        confirmLabel="Ya, hapus"
        cancelLabel="Batal"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </>
  );
}
