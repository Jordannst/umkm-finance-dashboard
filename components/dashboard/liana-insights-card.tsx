import {
  AlertTriangle,
  CalendarClock,
  Lightbulb,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { AskLianaButton } from "@/components/liana/ask-liana-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  DashboardInsight,
  InsightIcon,
  InsightSeverity,
} from "@/lib/finance/insights";
import { cn } from "@/lib/utils";

const ICON_MAP: Record<InsightIcon, LucideIcon> = {
  "trend-up": TrendingUp,
  "trend-down": TrendingDown,
  "alert-triangle": AlertTriangle,
  lightbulb: Lightbulb,
  "calendar-clock": CalendarClock,
  wallet: Wallet,
};

const SEVERITY_STYLES: Record<
  InsightSeverity,
  { bg: string; iconText: string; border: string }
> = {
  success: {
    bg: "bg-success/[0.07]",
    iconText: "text-success",
    border: "border-success/25",
  },
  warning: {
    bg: "bg-amber-500/[0.07]",
    iconText: "text-amber-600 dark:text-amber-400",
    border: "border-amber-500/25",
  },
  alert: {
    bg: "bg-destructive/[0.07]",
    iconText: "text-destructive",
    border: "border-destructive/25",
  },
  info: {
    bg: "bg-primary/[0.05]",
    iconText: "text-primary",
    border: "border-primary/20",
  },
};

interface LianaInsightsCardProps {
  insights: DashboardInsight[];
}

/**
 * Card insight proactive di dashboard. Otomatis hide kalau tidak ada
 * insight yang signifikan (misal: bisnis baru, data masih sedikit).
 *
 * Setiap insight item punya tombol "Tanya Liana" dengan prompt yang
 * sudah include angka konkret, sehingga Liana tidak perlu tanya balik
 * data — langsung kasih analisis & saran.
 */
export function LianaInsightsCard({ insights }: LianaInsightsCardProps) {
  if (insights.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-3 space-y-0">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="h-5 w-5" aria-hidden />
        </div>
        <div className="flex-1 space-y-0.5">
          <CardTitle className="text-base">Insight Liana</CardTitle>
          <CardDescription className="text-xs">
            Otomatis dihitung dari data 14 hari terakhir. Klik {`"Tanya Liana"`} untuk minta analisis.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-3 md:grid-cols-2">
          {insights.map((insight) => {
            const Icon = ICON_MAP[insight.icon];
            const styles = SEVERITY_STYLES[insight.severity];
            return (
              <li
                key={insight.id}
                className={cn(
                  "flex items-start gap-3 rounded-md border p-3 text-sm",
                  styles.border,
                  styles.bg,
                )}
              >
                <div
                  className={cn(
                    "grid h-8 w-8 shrink-0 place-items-center rounded-full bg-background",
                    styles.iconText,
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className="font-medium leading-tight">{insight.title}</p>
                  <p className="text-xs leading-snug text-muted-foreground">
                    {insight.description}
                  </p>
                  <AskLianaButton
                    prompt={insight.liana_prompt}
                    label="Tanya Liana detail"
                    size="sm"
                    variant="ghost"
                    className="-ml-2 h-7 text-xs"
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
