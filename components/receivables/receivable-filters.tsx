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

const STATUS_OPTIONS = [
  { value: "all", label: "Semua status" },
  { value: "active", label: "Belum lunas" },
  { value: "unpaid", label: "Belum bayar" },
  { value: "partial", label: "Bayar sebagian" },
  { value: "paid", label: "Lunas" },
];

export function ReceivableFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentStatus = searchParams.get("status") ?? "active";
  const [searchInput, setSearchInput] = React.useState(
    searchParams.get("search") ?? "",
  );

  function applyFilter(name: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === "" || (name === "status" && value === "all")) {
      params.delete(name);
    } else {
      params.set(name, value);
    }
    const qs = params.toString();
    router.replace(qs ? `/receivables?${qs}` : "/receivables", {
      scroll: false,
    });
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    applyFilter("search", searchInput.trim() || null);
  }

  function clearAll() {
    setSearchInput("");
    router.replace("/receivables", { scroll: false });
  }

  const hasActive =
    Boolean(searchParams.get("search")) ||
    (searchParams.get("status") && searchParams.get("status") !== "active");

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:p-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label
            htmlFor="filter-status"
            className="text-xs font-medium text-muted-foreground"
          >
            Status
          </Label>
          <Select
            value={currentStatus}
            onValueChange={(v) =>
              applyFilter("status", v === "active" ? null : v)
            }
          >
            <SelectTrigger id="filter-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label
            htmlFor="filter-search"
            className="text-xs font-medium text-muted-foreground"
          >
            Cari pelanggan / catatan
          </Label>
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <Input
              id="filter-search"
              type="search"
              placeholder="mis. Budi"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <Button type="submit" variant="secondary">
              Cari
            </Button>
          </form>
        </div>
      </div>
      {hasActive && (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={clearAll}>
            <X className="h-3.5 w-3.5" />
            Reset filter
          </Button>
        </div>
      )}
    </div>
  );
}
