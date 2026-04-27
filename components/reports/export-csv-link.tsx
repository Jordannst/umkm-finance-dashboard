import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";

interface ExportCsvLinkProps {
  preset: string;
  from: string;
  to: string;
}

/**
 * Tombol download CSV. Pakai native `<a download>` ke Route Handler
 * `/api/reports/export` — auth via cookie session yang sudah ada.
 */
export function ExportCsvLink({ preset, from, to }: ExportCsvLinkProps) {
  const params = new URLSearchParams({ preset, from, to });
  const href = `/api/reports/export?${params.toString()}`;
  return (
    <Button asChild variant="outline">
      <a href={href} download>
        <Download className="h-4 w-4" />
        Export CSV
      </a>
    </Button>
  );
}
