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
  createCategoryAction,
  updateCategoryAction,
  type CategoryFormState,
} from "@/lib/finance/settings/actions";
import type { Category, CategoryType } from "@/types/finance";

const initialState: CategoryFormState = { ok: false };

interface CategoryFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: CategoryType;
  category?: Category; // undefined = mode tambah
}

const TYPE_LABEL: Record<CategoryType, string> = {
  income: "Pemasukan",
  expense: "Pengeluaran",
  receivable: "Piutang",
};

export function CategoryForm({
  open,
  onOpenChange,
  type,
  category,
}: CategoryFormProps) {
  const isEdit = Boolean(category);
  const action = isEdit ? updateCategoryAction : createCategoryAction;
  const [state, formAction, pending] = useActionState(action, initialState);

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
          <DialogTitle>
            {isEdit ? "Edit kategori" : "Tambah kategori"}
          </DialogTitle>
          <DialogDescription>
            Tipe: <strong>{TYPE_LABEL[type]}</strong>. Slug dibuat otomatis
            dari nama.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} noValidate className="space-y-4">
          <input type="hidden" name="type" value={type} />
          {category && <input type="hidden" name="id" value={category.id} />}

          <div className="space-y-2">
            <Label htmlFor="cat-name">Nama kategori</Label>
            <Input
              id="cat-name"
              name="name"
              type="text"
              placeholder={
                type === "income"
                  ? "mis. Penjualan kopi"
                  : type === "expense"
                    ? "mis. Belanja bahan"
                    : "mis. Piutang pelanggan"
              }
              defaultValue={category?.name ?? ""}
              required
              autoFocus
              aria-invalid={Boolean(state.fieldErrors?.name)}
            />
            {state.fieldErrors?.name && (
              <p className="text-xs text-destructive">
                {state.fieldErrors.name}
              </p>
            )}
            {category && (
              <p className="text-xs text-muted-foreground">
                Slug saat ini: <code className="rounded bg-muted px-1">{category.slug}</code>
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
              {isEdit ? "Simpan" : "Tambah kategori"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
