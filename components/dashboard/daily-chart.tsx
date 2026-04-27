"use client";

import * as React from "react";
import { format, parseISO } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatRupiah } from "@/lib/finance/format";
import type { DailySeriesPoint } from "@/types/finance";

interface TooltipPayloadEntry {
  dataKey?: string | number;
  name?: string | number;
  value?: number | string;
  color?: string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string | number;
}

interface DailyChartProps {
  data: DailySeriesPoint[];
}

export function DailyChart({ data }: DailyChartProps) {
  const chartData = React.useMemo(
    () =>
      data.map((d) => ({
        ...d,
        label: format(parseISO(d.date), "EEE d", { locale: idLocale }),
      })),
    [data],
  );

  const totalIncome = data.reduce((sum, d) => sum + d.income, 0);
  const totalExpense = data.reduce((sum, d) => sum + d.expense, 0);
  const isEmpty = totalIncome === 0 && totalExpense === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pemasukan vs Pengeluaran</CardTitle>
        <CardDescription>
          7 hari terakhir.{" "}
          <span className="text-success">
            Pemasukan {formatRupiah(totalIncome)}
          </span>
          {" · "}
          <span className="text-destructive">
            Pengeluaran {formatRupiah(totalExpense)}
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <div className="flex h-[280px] flex-col items-center justify-center text-center text-sm text-muted-foreground">
            <p>Belum ada transaksi 7 hari terakhir.</p>
            <p>Catat pemasukan atau pengeluaran untuk melihat grafik.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="label"
                stroke="var(--muted-foreground)"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="var(--muted-foreground)"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value: number) => compactRupiah(value)}
                width={70}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
              <Legend
                verticalAlign="top"
                align="right"
                wrapperStyle={{ paddingBottom: 12, fontSize: 12 }}
                iconType="circle"
                iconSize={8}
              />
              <Bar
                dataKey="income"
                name="Pemasukan"
                fill="var(--chart-1)"
                radius={[6, 6, 0, 0]}
                maxBarSize={32}
              />
              <Bar
                dataKey="expense"
                name="Pengeluaran"
                fill="var(--chart-2)"
                radius={[6, 6, 0, 0]}
                maxBarSize={32}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Tampilkan angka rupiah ringkas di axis: "Rp1,2 jt", "Rp250 rb".
 */
function compactRupiah(value: number): string {
  if (!value) return "Rp0";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) {
    return `Rp${(value / 1_000_000_000).toFixed(1).replace(".", ",")} M`;
  }
  if (abs >= 1_000_000) {
    return `Rp${(value / 1_000_000).toFixed(1).replace(".", ",")} jt`;
  }
  if (abs >= 1_000) {
    return `Rp${Math.round(value / 1_000)} rb`;
  }
  return `Rp${value}`;
}

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-popover-foreground">{label}</p>
      <div className="space-y-1">
        {payload.map((entry, idx) => (
          <div
            key={String(entry.dataKey ?? idx)}
            className="flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: entry.color }}
                aria-hidden
              />
              <span className="text-muted-foreground">{entry.name}</span>
            </div>
            <span className="font-medium tabular-nums text-popover-foreground">
              {formatRupiah(Number(entry.value ?? 0))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
