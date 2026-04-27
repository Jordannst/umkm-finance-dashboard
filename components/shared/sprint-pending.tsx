import { Construction } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface SprintPendingProps {
  sprint: string;
  description: string;
  bullets?: string[];
}

/**
 * Placeholder seragam untuk halaman yang belum diimplementasi.
 * Dipakai di Sprint 0 sebelum sprint berikutnya menggantinya.
 */
export function SprintPending({ sprint, description, bullets }: SprintPendingProps) {
  return (
    <Card className="border-dashed bg-card/60">
      <CardContent className="flex flex-col items-start gap-4 px-6 py-8">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5 border-warning/40 bg-warning/10 text-warning-foreground">
            <Construction className="h-3.5 w-3.5" aria-hidden />
            {sprint}
          </Badge>
          <span className="text-xs text-muted-foreground">
            Akan diimplementasikan
          </span>
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
        {bullets && bullets.length > 0 && (
          <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
            {bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
