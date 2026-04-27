"use client";

import * as React from "react";
import { Plus, Tag } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CategoryForm } from "@/components/settings/category-form";
import { CategoryRowActions } from "@/components/settings/category-row-actions";
import { cn } from "@/lib/utils";
import type { Category, CategoryType } from "@/types/finance";

interface CategoriesSectionProps {
  income: Category[];
  expense: Category[];
  receivable: Category[];
}

const TABS: { type: CategoryType; label: string; description: string }[] = [
  {
    type: "income",
    label: "Pemasukan",
    description: "Kategori untuk transaksi pemasukan dari dashboard atau Liana.",
  },
  {
    type: "expense",
    label: "Pengeluaran",
    description: "Kategori untuk pengeluaran (belanja bahan, sewa, dst).",
  },
  {
    type: "receivable",
    label: "Piutang",
    description: "Kategori untuk piutang pelanggan (mis. kantor, partai besar).",
  },
];

export function CategoriesSection({
  income,
  expense,
  receivable,
}: CategoriesSectionProps) {
  const [activeType, setActiveType] = React.useState<CategoryType>("income");
  const [addOpen, setAddOpen] = React.useState(false);

  const dataMap: Record<CategoryType, Category[]> = {
    income,
    expense,
    receivable,
  };
  const items = dataMap[activeType];
  const activeMeta = TABS.find((t) => t.type === activeType)!;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Kategori</CardTitle>
            <CardDescription>
              Kategori dipakai untuk klasifikasi transaksi dan piutang.
              Slug dibuat otomatis dari nama dan unik per (bisnis, tipe).
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            Tambah kategori
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Tab manual */}
        <div
          role="tablist"
          aria-label="Filter tipe kategori"
          className="inline-flex flex-wrap gap-1 rounded-lg bg-muted p-1"
        >
          {TABS.map((tab) => (
            <button
              key={tab.type}
              type="button"
              role="tab"
              aria-selected={activeType === tab.type}
              onClick={() => setActiveType(tab.type)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                activeType === tab.type
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
              <span className="ml-1.5 text-xs tabular-nums opacity-70">
                ({dataMap[tab.type].length})
              </span>
            </button>
          ))}
        </div>

        <p className="text-sm text-muted-foreground">
          {activeMeta.description}
        </p>

        {items.length === 0 ? (
          <div className="grid place-items-center rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
            <Tag className="mb-2 h-6 w-6" aria-hidden />
            <p>Belum ada kategori {activeMeta.label.toLowerCase()}.</p>
            <p className="text-xs">Tambah lewat tombol di pojok kanan.</p>
          </div>
        ) : (
          <ul className="divide-y rounded-lg border">
            {items.map((cat) => (
              <li
                key={cat.id}
                className="flex items-center gap-3 px-3 py-2.5"
              >
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-muted">
                  <Tag className="h-4 w-4 text-muted-foreground" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{cat.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    <code>{cat.slug}</code>
                  </p>
                </div>
                <CategoryRowActions category={cat} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {addOpen && (
        <CategoryForm
          open={addOpen}
          onOpenChange={setAddOpen}
          type={activeType}
        />
      )}
    </Card>
  );
}
