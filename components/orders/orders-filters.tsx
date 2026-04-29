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
import {
  ORDER_STATUS_LABEL,
  ORDER_STATUS_OPTIONS,
  PAYMENT_STATUS_LABEL,
  type OrderStatus,
  type PaymentStatus,
} from "@/types/sorea";

const ALL_VALUE = "__all__";

const PAYMENT_STATUSES: PaymentStatus[] = ["pending", "paid", "failed", "refunded"];

export function OrdersFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentSearch = searchParams.get("search") ?? "";
  const currentStatus =
    (searchParams.get("status") as OrderStatus | null) ?? null;
  const currentPayment =
    (searchParams.get("payment_status") as PaymentStatus | null) ?? null;
  const currentFrom = searchParams.get("from") ?? "";
  const currentTo = searchParams.get("to") ?? "";

  function applyFilter(name: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value) params.delete(name);
    else params.set(name, value);
    const qs = params.toString();
    router.replace(qs ? `/orders?${qs}` : "/orders", { scroll: false });
  }

  function clearAll() {
    router.replace("/orders", { scroll: false });
  }

  function commitSearch(value: string) {
    applyFilter("search", value.trim() || null);
  }

  const hasActive =
    Boolean(currentSearch) ||
    Boolean(currentStatus) ||
    Boolean(currentPayment) ||
    Boolean(currentFrom) ||
    Boolean(currentTo);

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:p-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1.5 lg:col-span-2">
          <Label
            htmlFor="filter-search"
            className="text-xs font-medium text-muted-foreground"
          >
            Cari customer / kode
          </Label>
          <Input
            // key={currentSearch} bikin input remount saat URL berubah
            // dari luar (Reset filter), reset defaultValue.
            key={currentSearch}
            id="filter-search"
            type="search"
            placeholder="Patricia, ORD-..."
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
            htmlFor="filter-status"
            className="text-xs font-medium text-muted-foreground"
          >
            Status order
          </Label>
          <Select
            value={currentStatus ?? ALL_VALUE}
            onValueChange={(v) =>
              applyFilter("status", v === ALL_VALUE ? null : v)
            }
          >
            <SelectTrigger id="filter-status">
              <SelectValue placeholder="Semua status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>Semua status</SelectItem>
              {ORDER_STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {ORDER_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label
            htmlFor="filter-payment"
            className="text-xs font-medium text-muted-foreground"
          >
            Status bayar
          </Label>
          <Select
            value={currentPayment ?? ALL_VALUE}
            onValueChange={(v) =>
              applyFilter("payment_status", v === ALL_VALUE ? null : v)
            }
          >
            <SelectTrigger id="filter-payment">
              <SelectValue placeholder="Semua bayar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>Semua bayar</SelectItem>
              {PAYMENT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {PAYMENT_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2 lg:col-span-1 lg:grid-cols-1">
          <div className="space-y-1.5">
            <Label
              htmlFor="filter-from"
              className="text-xs font-medium text-muted-foreground"
            >
              Dari
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
            <Label
              htmlFor="filter-to"
              className="text-xs font-medium text-muted-foreground"
            >
              Sampai
            </Label>
            <Input
              id="filter-to"
              type="date"
              value={currentTo}
              min={currentFrom || undefined}
              onChange={(e) => applyFilter("to", e.target.value || null)}
            />
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
