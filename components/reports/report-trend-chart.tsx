"use client";

import * as React from "react";
import { format, parseISO } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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

interface ReportTrendChartProps {
  data: DailySeriesPoint[];
  periodLabel: string;
}

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

interface ChartPoint extends DailySeriesPoint {
  profit: number;
  label: string;
}

export function ReportTrendChart({
  data,
  periodLabel,
}: ReportTrendChartProps) {
  const chartData: ChartPoint[] = React.useMemo(
    () =>
      data.map((d) => ({
        ...d,
        profit: d.income - d.expense,
        label: format(parseISO(d.date), "d MMM", { locale: idLocale }),
      })),
    [data],
  );

  const totalIncome = data.reduce((s, d) => s + d.income, 0);
  const totalExpense = data.reduce((s, d) => s + d.expense, 0);
  const isEmpty = totalIncome === 0 && totalExpense === 0;

  // Heuristic: kalau ≤ 14 titik pakai bar feel via area, kalau lebih
  // pakai line untuk menjaga kerapian.
  const useLine = chartData.length > 14;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trend pemasukan vs pengeluaran</CardTitle>
        <CardDescription>
          {periodLabel}.{" "}
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
          <div className="flex h-[320px] flex-col items-center justify-center text-center text-sm text-muted-foreground">
            <p>Belum ada transaksi di periode ini.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            {useLine ? (
              <LineChart
                data={chartData}
                margin={{ top: 8, right: 16, left: -8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="label"
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => compactRupiah(v)}
                  width={70}
                />
                <Tooltip content={<ChartTooltip />} />
                <Legend
                  verticalAlign="top"
                  align="right"
                  wrapperStyle={{ paddingBottom: 12, fontSize: 12 }}
                  iconType="circle"
                  iconSize={8}
                />
                <Line
                  type="monotone"
                  dataKey="income"
                  name="Pemasukan"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="expense"
                  name="Pengeluaran"
                  stroke="var(--chart-2)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="profit"
                  name="Laba"
                  stroke="var(--chart-3)"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={false}
                />
              </LineChart>
            ) : (
              <AreaChart
                data={chartData}
                margin={{ top: 8, right: 16, left: -8, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="label"
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => compactRupiah(v)}
                  width={70}
                />
                <Tooltip content={<ChartTooltip />} />
                <Legend
                  verticalAlign="top"
                  align="right"
                  wrapperStyle={{ paddingBottom: 12, fontSize: 12 }}
                  iconType="circle"
                  iconSize={8}
                />
                <Area
                  type="monotone"
                  dataKey="income"
                  name="Pemasukan"
                  stroke="var(--chart-1)"
                  fill="url(#incomeFill)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="expense"
                  name="Pengeluaran"
                  stroke="var(--chart-2)"
                  fill="url(#expenseFill)"
                  strokeWidth={2}
                />
              </AreaChart>
            )}
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

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
