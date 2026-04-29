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
import {
  createProductAction,
  updateProductAction,
  type ProductFormState,
} from "@/lib/sorea/products/actions";
import { cn } from "@/lib/utils";
import {
  STOCK_STATUS_LABEL,
  STOCK_STATUS_OPTIONS,
  type Product,
  type ProductStockStatus,
} from "@/types/sorea";

const initialState: ProductFormState = { ok: false };

interface ProductFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** undefined = mode tambah, Product = mode edit */
  product?: Product;
  /**
   * Existing categories (untuk autocomplete suggest). Boleh kosong.
   * Field category bersifat freeform — admin boleh input kategori
   * baru yang belum ada.
   */
  knownCategories?: string[];
}

export function ProductForm({
  open,
  onOpenChange,
  product,
  knownCategories = [],
}: ProductFormProps) {
  const isEdit = Boolean(product);
  const action = isEdit ? updateProductAction : createProductAction;
  const [state, formAction, pending] = useActionState(action, initialState);

  const [stockStatus, setStockStatus] = React.useState<ProductStockStatus>(
    product?.stock_status ?? "ready",
  );
  const [isActive, setIsActive] = React.useState<boolean>(
    product?.is_active ?? true,
  );

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
          <DialogTitle>{isEdit ? "Edit produk" : "Tambah produk"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Ubah harga, stok, atau status. SKU tidak bisa diubah."
              : "Isi detail produk baru. SKU harus unik per bisnis."}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} noValidate className="space-y-4">
          {product && <input type="hidden" name="id" value={product.id} />}
          <input type="hidden" name="stock_status" value={stockStatus} />
          <input
            type="hidden"
            name="is_active"
            value={isActive ? "true" : "false"}
          />

          {/* SKU — only on create */}
          {!isEdit && (
            <FieldRow label="SKU" htmlFor="sku" error={state.fieldErrors?.sku}>
              <Input
                id="sku"
                name="sku"
                placeholder="P013"
                maxLength={32}
                autoComplete="off"
                required
                aria-invalid={Boolean(state.fieldErrors?.sku)}
              />
              <p className="text-xs text-muted-foreground">
                Huruf, angka, dash, underscore. Tidak bisa diubah setelah
                disimpan.
              </p>
            </FieldRow>
          )}
          {isEdit && product && (
            <div className="space-y-1">
              <Label className="text-muted-foreground">SKU</Label>
              <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm font-mono">
                {product.sku}
              </p>
            </div>
          )}

          {/* Name */}
          <FieldRow label="Nama produk" htmlFor="name" error={state.fieldErrors?.name}>
            <Input
              id="name"
              name="name"
              placeholder="SOREA Es Kopi Susu"
              maxLength={120}
              defaultValue={product?.name ?? ""}
              required
              aria-invalid={Boolean(state.fieldErrors?.name)}
            />
          </FieldRow>

          {/* Category — text input dengan datalist */}
          <FieldRow
            label="Kategori"
            htmlFor="category"
            error={state.fieldErrors?.category}
          >
            <Input
              id="category"
              name="category"
              placeholder="Coffee"
              maxLength={60}
              list="product-categories-suggest"
              defaultValue={product?.category ?? ""}
              required
              aria-invalid={Boolean(state.fieldErrors?.category)}
            />
            {knownCategories.length > 0 && (
              <datalist id="product-categories-suggest">
                {knownCategories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            )}
          </FieldRow>

          {/* Price */}
          <FieldRow label="Harga (Rp)" htmlFor="price" error={state.fieldErrors?.price}>
            <Input
              id="price"
              name="price"
              type="number"
              inputMode="numeric"
              min={0}
              step={500}
              placeholder="20000"
              defaultValue={product ? String(product.price) : ""}
              required
              aria-invalid={Boolean(state.fieldErrors?.price)}
            />
            <p className="text-xs text-muted-foreground">
              Rupiah utuh, tanpa titik. Contoh: 20000.
            </p>
          </FieldRow>

          {/* Stock status */}
          <div className="space-y-2">
            <Label htmlFor="stock_status_select">Status stok</Label>
            <Select
              value={stockStatus}
              onValueChange={(v) => setStockStatus(v as ProductStockStatus)}
            >
              <SelectTrigger id="stock_status_select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STOCK_STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {STOCK_STATUS_LABEL[opt]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Is active toggle */}
          <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Tampilkan di menu</p>
              <p className="text-xs text-muted-foreground">
                Off untuk seasonal/temporary unavailable. Tidak menghapus data.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isActive}
              onClick={() => setIsActive((v) => !v)}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors",
                isActive ? "bg-primary" : "bg-muted",
              )}
            >
              <span
                className={cn(
                  "inline-block h-5 w-5 transform rounded-full bg-background shadow transition-transform",
                  isActive ? "translate-x-5" : "translate-x-0.5",
                )}
              />
            </button>
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
              {isEdit ? "Simpan perubahan" : "Tambah produk"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface FieldRowProps {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}

function FieldRow({ label, htmlFor, error, children }: FieldRowProps) {
  return (
    <div className="space-y-1">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
