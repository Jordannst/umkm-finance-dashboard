"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface PeriodSelectorProps {
  /** Preset aktif yang resolved di server. */
  activePreset: string;
  /** From + to yang sedang aktif (dipakai untuk pre-fill custom inputs). */
  activeFrom: string;
  activeTo: string;
}

const PRESETS: { value: string; label: string }[] = [
  { value: "today", label: "Hari ini" },
  { value: "yesterday", label: "Kemarin" },
  { value: "7d", label: "7 hari" },
  { value: "30d", label: "30 hari" },
  { value: "this-month", label: "Bulan ini" },
  { value: "last-month", label: "Bulan lalu" },
];

export function PeriodSelector({
  activePreset,
  activeFrom,
  activeTo,
}: PeriodSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [from, setFrom] = React.useState(activeFrom);
  const [to, setTo] = React.useState(activeTo);

  function applyPreset(preset: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("preset", preset);
    params.delete("from");
    params.delete("to");
    router.replace(`/reports?${params.toString()}`, { scroll: false });
  }

  function applyCustom(e: React.FormEvent) {
    e.preventDefault();
    if (!from || !to) return;
    const [a, b] = from <= to ? [from, to] : [to, from];
    const params = new URLSearchParams(searchParams.toString());
    params.set("preset", "custom");
    params.set("from", a);
    params.set("to", b);
    router.replace(`/reports?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:p-5">
      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground">
          Periode laporan
        </Label>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <Button
              key={preset.value}
              type="button"
              variant={activePreset === preset.value ? "default" : "outline"}
              size="sm"
              onClick={() => applyPreset(preset.value)}
              className={cn(
                "h-8",
                activePreset === preset.value && "shadow-sm",
              )}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </div>

      <form
        onSubmit={applyCustom}
        className="grid grid-cols-1 gap-3 border-t pt-3 sm:grid-cols-3"
      >
        <div className="space-y-1.5">
          <Label
            htmlFor="period-from"
            className="text-xs font-medium text-muted-foreground"
          >
            Dari
          </Label>
          <Input
            id="period-from"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label
            htmlFor="period-to"
            className="text-xs font-medium text-muted-foreground"
          >
            Sampai
          </Label>
          <Input
            id="period-to"
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <div className="flex items-end">
          <Button
            type="submit"
            variant={activePreset === "custom" ? "default" : "secondary"}
            className="w-full sm:w-auto"
          >
            Terapkan periode kustom
          </Button>
        </div>
      </form>
    </div>
  );
}
