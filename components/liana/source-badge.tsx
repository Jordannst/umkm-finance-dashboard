import { Bot, Globe, Settings2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DataSource } from "@/types/finance";

interface SourceBadgeProps {
  source: DataSource;
  /** Sembunyikan label, hanya tampilkan icon (untuk mobile/compact). */
  iconOnly?: boolean;
  className?: string;
}

const sourceMeta: Record<
  DataSource,
  {
    label: string;
    icon: typeof Bot;
    /** className tambahan untuk warna khas Liana vs lainnya. */
    classes: string;
  }
> = {
  chat: {
    label: "Dicatat via Liana",
    icon: Bot,
    classes:
      "border-transparent bg-primary/10 text-primary hover:bg-primary/15",
  },
  dashboard: {
    label: "Dashboard",
    icon: Globe,
    classes:
      "border-transparent bg-muted/70 text-muted-foreground hover:bg-muted",
  },
  system: {
    label: "System",
    icon: Settings2,
    classes:
      "border-transparent bg-secondary/40 text-secondary-foreground hover:bg-secondary/60",
  },
};

/**
 * Badge yang menunjukkan asal data: chat (Liana), dashboard, atau system.
 * Dipakai di tabel transaksi & piutang untuk mempertegas integrasi Liana.
 */
export function SourceBadge({ source, iconOnly, className }: SourceBadgeProps) {
  const meta = sourceMeta[source] ?? sourceMeta.dashboard;
  const Icon = meta.icon;

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 whitespace-nowrap font-medium",
        meta.classes,
        className,
      )}
      aria-label={meta.label}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {!iconOnly && <span>{meta.label}</span>}
    </Badge>
  );
}
