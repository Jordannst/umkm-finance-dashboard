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
import { CategoryForm } from "@/components/settings/category-form";
import { deleteCategoryAction } from "@/lib/finance/settings/actions";
import type { Category } from "@/types/finance";

interface CategoryRowActionsProps {
  category: Category;
}

export function CategoryRowActions({ category }: CategoryRowActionsProps) {
  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  async function handleDelete() {
    const fd = new FormData();
    fd.set("id", category.id);
    const result = await deleteCategoryAction(fd);
    if (result.ok) {
      toast.success(`Kategori "${category.name}" dihapus.`);
    } else {
      toast.error(result.message ?? "Gagal menghapus kategori.");
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Aksi kategori">
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
            Rename
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

      {editOpen && (
        <CategoryForm
          open={editOpen}
          onOpenChange={setEditOpen}
          type={category.type}
          category={category}
        />
      )}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Hapus kategori "${category.name}"?`}
        description="Riwayat transaksi/piutang yang pakai kategori ini tetap aman, tapi kolom kategori akan jadi kosong (snapshot nama tetap tersimpan)."
        confirmLabel="Ya, hapus"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </>
  );
}
