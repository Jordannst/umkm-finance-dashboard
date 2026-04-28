import { Bot, Sparkles } from "lucide-react";

import { AskLianaButton } from "@/components/liana/ask-liana-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface SuggestionItem {
  label: string;
  prompt: string;
}

interface LianaSuggestionCardProps {
  /** Override default suggestions kalau halaman tertentu mau custom. */
  suggestions?: SuggestionItem[];
  /** Title alternatif. */
  title?: string;
  /** Description alternatif. */
  description?: string;
}

const DEFAULT_SUGGESTIONS: SuggestionItem[] = [
  {
    label: "Rekap hari ini",
    prompt:
      "Liana, rekap keuangan hari ini dan beri catatan singkat untuk owner UMKM.",
  },
  {
    label: "Pengeluaran terbesar",
    prompt:
      "Liana, cari pengeluaran terbesar minggu ini dan beri saran singkat.",
  },
  {
    label: "Piutang aktif",
    prompt:
      "Liana, siapa saja yang masih punya piutang aktif? Ringkas nama, nominal, dan statusnya.",
  },
  {
    label: "Contoh input pemasukan",
    prompt: "pemasukan 50rb jual kopi susu",
  },
];

/**
 * Card suggestion list di dashboard yang mengarahkan user mengirim prompt
 * ke Liana via Telegram. Tiap chip adalah AskLianaButton yang copy prompt
 * ke clipboard.
 *
 * Tujuan: bikin integrasi Liana terasa "ada di dalam dashboard" tanpa
 * embed chat panel di MVP.
 */
export function LianaSuggestionCard({
  suggestions = DEFAULT_SUGGESTIONS,
  title = "Tanya Liana",
  description = "Coba kirim salah satu prompt ini ke Liana di Telegram. Klik untuk salin.",
}: LianaSuggestionCardProps) {
  return (
    <Card className="border-primary/20 bg-primary/[0.03]">
      <CardHeader className="flex flex-row items-start gap-3 space-y-0">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <Bot className="h-5 w-5" aria-hidden />
        </div>
        <div className="flex-1 space-y-0.5">
          <CardTitle className="flex items-center gap-2 text-base">
            {title}
            <Sparkles
              className="h-3.5 w-3.5 text-primary"
              aria-hidden
            />
          </CardTitle>
          <CardDescription className="text-xs">{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <AskLianaButton
              key={s.label}
              prompt={s.prompt}
              label={s.label}
              size="sm"
              variant="outline"
              className="bg-background"
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
