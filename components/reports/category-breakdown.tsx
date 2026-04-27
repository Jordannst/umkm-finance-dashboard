import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatRupiah } from "@/lib/finance/format";
import { cn } from "@/lib/utils";
import type { CategoryBreakdownItem } from "@/lib/finance/reports/queries";

interface CategoryBreakdownProps {
  income: CategoryBreakdownItem[];
  expense: CategoryBreakdownItem[];
}

export function CategoryBreakdown({
  income,
  expense,
}: CategoryBreakdownProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <BreakdownCard
        title="Pemasukan per kategori"
        description="Sumber pendapatan terbesar di periode ini."
        items={income}
        accent="text-success"
        bar="bg-success"
        icon={ArrowUpRight}
      />
      <BreakdownCard
        title="Pengeluaran per kategori"
        description="Pos pengeluaran terbesar di periode ini."
        items={expense}
        accent="text-destructive"
        bar="bg-destructive"
        icon={ArrowDownRight}
      />
    </div>
  );
}

interface BreakdownCardProps {
  title: string;
  description: string;
  items: CategoryBreakdownItem[];
  accent: string;
  bar: string;
  icon: typeof ArrowUpRight;
}

function BreakdownCard({
  title,
  description,
  items,
  accent,
  bar,
  icon: Icon,
}: BreakdownCardProps) {
  // Top 6 + sisanya digabung sebagai "Lainnya"
  const top = items.slice(0, 6);
  const rest = items.slice(6);
  const restAmount = rest.reduce((s, it) => s + it.amount, 0);
  const restCount = rest.reduce((s, it) => s + it.count, 0);
  const restPercent = rest.reduce((s, it) => s + it.percentage, 0);

  const display: CategoryBreakdownItem[] =
    rest.length > 0
      ? [
          ...top,
          {
            category_id: null,
            category_name: `${rest.length} kategori lain`,
            type: top[0]?.type ?? "income",
            amount: restAmount,
            count: restCount,
            percentage: restPercent,
          },
        ]
      : top;

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        {display.length === 0 ? (
          <div className="grid h-full place-items-center py-10 text-center text-sm text-muted-foreground">
            <div className="space-y-2">
              <Icon className={cn("mx-auto h-6 w-6", accent)} aria-hidden />
              <p>Belum ada data di periode ini.</p>
            </div>
          </div>
        ) : (
          <ul className="space-y-3">
            {display.map((item, idx) => (
              <li
                key={`${item.category_id ?? "none"}-${idx}`}
                className="space-y-1"
              >
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate font-medium">
                    {item.category_name}
                  </span>
                  <span className={cn("font-semibold tabular-nums", accent)}>
                    {formatRupiah(item.amount)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(item.percentage)}
                  >
                    <div
                      className={cn("h-full", bar)}
                      style={{
                        width: `${Math.max(2, item.percentage)}%`,
                      }}
                    />
                  </div>
                  <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {item.percentage.toFixed(1)}% · {item.count}x
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
