"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Bot, X } from "lucide-react";

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
import type {
  Category,
  DataSource,
  TransactionType,
} from "@/types/finance";

interface TransactionFiltersProps {
  categories: Category[]; // semua kategori income+expense+receivable
}

type TypeFilter = TransactionType | "all";
type SourceFilter = DataSource | "all";

const ALL_VALUE = "__all__";

export function TransactionFilters({ categories }: TransactionFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentFrom = searchParams.get("from") ?? "";
  const currentTo = searchParams.get("to") ?? "";
  const currentType = (searchParams.get("type") as TypeFilter | null) ?? "all";
  const currentCategoryId = searchParams.get("categoryId") ?? "";
  const currentSource =
    (searchParams.get("source") as SourceFilter | null) ?? "all";

  function applyFilter(name: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value) {
      params.delete(name);
    } else {
      params.set(name, value);
    }
    const qs = params.toString();
    router.replace(qs ? `/transactions?${qs}` : "/transactions", {
      scroll: false,
    });
  }

  function clearAll() {
    router.replace("/transactions", { scroll: false });
  }

  const filteredCategories = React.useMemo(() => {
    if (currentType === "all" || currentType === "receivable_payment") {
      return categories;
    }
    return categories.filter((c) => c.type === currentType);
  }, [categories, currentType]);

  const hasActive =
    Boolean(currentFrom) ||
    Boolean(currentTo) ||
    currentType !== "all" ||
    Boolean(currentCategoryId) ||
    currentSource !== "all";

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:p-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="filter-from" className="text-xs font-medium text-muted-foreground">
            Dari tanggal
          </Label>
          <Input
            id="filter-from"
            type="date"
            value={currentFrom}
            max={currentTo || undefined}
            onChange={(e) => applyFilter("from", e.target.value || null)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="filter-to" className="text-xs font-medium text-muted-foreground">
            Sampai tanggal
          </Label>
          <Input
            id="filter-to"
            type="date"
            value={currentTo}
            min={currentFrom || undefined}
            onChange={(e) => applyFilter("to", e.target.value || null)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="filter-type" className="text-xs font-medium text-muted-foreground">
            Tipe
          </Label>
          <Select
            value={currentType}
            onValueChange={(v) =>
              applyFilter("type", v === "all" ? null : v)
            }
          >
            <SelectTrigger id="filter-type">
              <SelectValue placeholder="Semua tipe" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua tipe</SelectItem>
              <SelectItem value="income">Pemasukan</SelectItem>
              <SelectItem value="expense">Pengeluaran</SelectItem>
              <SelectItem value="receivable_payment">
                Pelunasan piutang
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label
            htmlFor="filter-category"
            className="text-xs font-medium text-muted-foreground"
          >
            Kategori
          </Label>
          <Select
            value={currentCategoryId || ALL_VALUE}
            onValueChange={(v) =>
              applyFilter("categoryId", v === ALL_VALUE ? null : v)
            }
          >
            <SelectTrigger id="filter-category">
              <SelectValue placeholder="Semua kategori" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>Semua kategori</SelectItem>
              {filteredCategories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Sumber:
          </span>
          <SourceChip
            active={currentSource === "all"}
            onClick={() => applyFilter("source", null)}
          >
            Semua
          </SourceChip>
          <SourceChip
            active={currentSource === "dashboard"}
            onClick={() => applyFilter("source", "dashboard")}
          >
            Dashboard
          </SourceChip>
          <SourceChip
            active={currentSource === "chat"}
            onClick={() => applyFilter("source", "chat")}
            highlight
          >
            <Bot className="h-3.5 w-3.5" aria-hidden />
            Liana Chat
          </SourceChip>
        </div>
        {hasActive && (
          <Button variant="ghost" size="sm" onClick={clearAll}>
            <X className="h-3.5 w-3.5" />
            Reset filter
          </Button>
        )}
      </div>
    </div>
  );
}

function SourceChip({
  active,
  highlight,
  onClick,
  children,
}: {
  active: boolean;
  highlight?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? highlight
            ? "border-primary bg-primary/10 text-primary"
            : "border-foreground bg-foreground text-background"
          : "border-input bg-background text-muted-foreground hover:bg-muted",
      )}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}
