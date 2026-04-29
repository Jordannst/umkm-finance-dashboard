"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  STOCK_STATUS_LABEL,
  STOCK_STATUS_OPTIONS,
  type ProductStockStatus,
} from "@/types/sorea";

interface ProductFiltersProps {
  /** Daftar kategori unik dari produk yang ada (sudah di-fetch server). */
  categories: string[];
}

const ALL_VALUE = "__all__";
type ActiveFilter = "all" | "active" | "inactive";

export function ProductFilters({ categories }: ProductFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentSearch = searchParams.get("search") ?? "";
  const currentCategory = searchParams.get("category") ?? "";
  const currentStock =
    (searchParams.get("stock_status") as ProductStockStatus | null) ?? null;
  const currentActive = (searchParams.get("active") as ActiveFilter | null) ?? "all";

  function applyFilter(name: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value) params.delete(name);
    else params.set(name, value);
    const qs = params.toString();
    router.replace(qs ? `/products?${qs}` : "/products", { scroll: false });
  }

  function clearAll() {
    router.replace("/products", { scroll: false });
  }

  // Search input dipakai uncontrolled: defaultValue + key={currentSearch}.
  // Saat URL search berubah dari luar (mis. clearAll), key berubah → input
  // remount → defaultValue baru ke-apply. Pattern ini hindari setState
  // dalam useEffect (yang men-trigger cascading renders + react-hooks lint).
  function commitSearch(value: string) {
    applyFilter("search", value.trim() || null);
  }

  const hasActive =
    Boolean(currentSearch) ||
    Boolean(currentCategory) ||
    Boolean(currentStock) ||
    currentActive !== "all";

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:p-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label
            htmlFor="filter-search"
            className="text-xs font-medium text-muted-foreground"
          >
            Cari nama / SKU
          </Label>
          <Input
            // key={currentSearch} bikin input remount saat URL search
            // berubah dari luar (mis. tombol Reset), reset defaultValue.
            key={currentSearch}
            id="filter-search"
            type="search"
            placeholder="kopi, P001, ..."
            defaultValue={currentSearch}
            onBlur={(e) => commitSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitSearch(e.currentTarget.value);
              }
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label
            htmlFor="filter-category"
            className="text-xs font-medium text-muted-foreground"
          >
            Kategori
          </Label>
          <Select
            value={currentCategory || ALL_VALUE}
            onValueChange={(v) =>
              applyFilter("category", v === ALL_VALUE ? null : v)
            }
          >
            <SelectTrigger id="filter-category">
              <SelectValue placeholder="Semua kategori" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>Semua kategori</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label
            htmlFor="filter-stock"
            className="text-xs font-medium text-muted-foreground"
          >
            Status stok
          </Label>
          <Select
            value={currentStock ?? ALL_VALUE}
            onValueChange={(v) =>
              applyFilter("stock_status", v === ALL_VALUE ? null : v)
            }
          >
            <SelectTrigger id="filter-stock">
              <SelectValue placeholder="Semua stok" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>Semua stok</SelectItem>
              {STOCK_STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {STOCK_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">
            Tampilkan
          </Label>
          <div className="flex gap-2">
            <ActivePill
              active={currentActive === "all"}
              onClick={() => applyFilter("active", null)}
            >
              Semua
            </ActivePill>
            <ActivePill
              active={currentActive === "active"}
              onClick={() => applyFilter("active", "active")}
            >
              Aktif
            </ActivePill>
            <ActivePill
              active={currentActive === "inactive"}
              onClick={() => applyFilter("active", "inactive")}
            >
              Sembunyi
            </ActivePill>
          </div>
        </div>
      </div>
      {hasActive && (
        <div className="flex justify-end border-t pt-3">
          <Button variant="ghost" size="sm" onClick={clearAll}>
            <X className="h-3.5 w-3.5" />
            Reset filter
          </Button>
        </div>
      )}
    </div>
  );
}

function ActivePill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-input bg-background text-muted-foreground hover:bg-muted",
      )}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}
