"use client";

import * as React from "react";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  ExternalLink,
  Loader2,
  MessageSquare,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useLianaRuns, type LianaRun } from "@/hooks/use-liana-runs";
import { cn } from "@/lib/utils";

interface LianaChatPanelProps {
  userId: string;
  /** Username bot Telegram untuk tombol "Buka di Telegram". Optional. */
  botUsername?: string;
}

/**
 * Floating widget yang nampilin riwayat "Tanya Liana" + status real-time.
 *
 * Layout:
 *  - Collapsed: floating bubble bottom-right (FAB) dengan badge pending
 *  - Expanded: side drawer dari kanan, list runs, expandable per run
 *
 * Real-time:
 *  - Pending run muncul instan saat user klik tombol Tanya Liana (INSERT
 *    via /api/liana/ask).
 *  - Status berubah jadi 'done' + reply_text terisi saat callback masuk
 *    (UPDATE via /api/liana/run-callback). Subscribe Supabase Realtime.
 */
export function LianaChatPanel({ userId, botUsername }: LianaChatPanelProps) {
  const [open, setOpen] = React.useState(false);
  const { runs, pendingCount, loading } = useLianaRuns({ userId });

  // Auto-open saat ada pending run baru (UX cue: user klik tombol → panel
  // otomatis terbuka supaya gak terlewat). Cek lewat ref biar gak loop.
  const lastPendingCountRef = React.useRef(0);
  React.useEffect(() => {
    if (
      pendingCount > lastPendingCountRef.current &&
      pendingCount > 0 &&
      !open
    ) {
      setOpen(true);
    }
    lastPendingCountRef.current = pendingCount;
  }, [pendingCount, open]);

  return (
    <>
      {/* Backdrop saat panel terbuka di mobile */}
      {open && (
        <div
          aria-hidden
          className="fixed inset-0 z-40 bg-black/20 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Floating bubble (FAB) — selalu render */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "fixed bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-all",
          "bg-primary text-primary-foreground hover:scale-105 hover:shadow-xl",
          open && "scale-90 opacity-80",
        )}
        aria-label={open ? "Tutup riwayat Liana" : "Buka riwayat Liana"}
      >
        <Bot className="h-5 w-5" aria-hidden />
        {pendingCount > 0 && !open && (
          <span
            className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1.5 text-[10px] font-bold text-white"
            aria-label={`${pendingCount} request pending`}
          >
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          </span>
        )}
      </button>

      {/* Side drawer panel */}
      <aside
        aria-hidden={!open}
        className={cn(
          "fixed right-0 top-0 z-50 h-full w-full max-w-md transform border-l border-border bg-background shadow-xl transition-transform duration-200",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" aria-hidden />
              <h2 className="text-sm font-semibold">Riwayat Tanya Liana</h2>
              {pendingCount > 0 && (
                <span className="rounded-full bg-orange-500/10 px-2 py-0.5 text-[10px] font-semibold text-orange-600">
                  {pendingCount} pending
                </span>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setOpen(false)}
              aria-label="Tutup panel"
              className="h-8 w-8"
            >
              <X className="h-4 w-4" aria-hidden />
            </Button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                Memuat riwayat...
              </div>
            ) : runs.length === 0 ? (
              <EmptyState />
            ) : (
              <ul className="space-y-3">
                {runs.map((run) => (
                  <RunItem
                    key={run.id}
                    run={run}
                    botUsername={botUsername}
                  />
                ))}
              </ul>
            )}
          </div>

          {/* Footer hint */}
          <div className="border-t border-border bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
            Klik tombol{" "}
            <span className="rounded bg-background px-1 font-medium">
              Tanya Liana
            </span>{" "}
            di mana saja untuk mulai bertanya. Balasan masuk ke Telegram +
            panel ini.
          </div>
        </div>
      </aside>
    </>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
        <MessageSquare className="h-6 w-6 text-primary" aria-hidden />
      </div>
      <p className="text-sm font-medium">Belum ada percakapan</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Klik tombol &ldquo;Tanya Liana&rdquo; di dashboard, transaksi, piutang,
        atau laporan.
      </p>
    </div>
  );
}

function RunItem({
  run,
  botUsername,
}: {
  run: LianaRun;
  botUsername?: string;
}) {
  const [expanded, setExpanded] = React.useState(
    run.status === "pending" || isRecent(run.created_at),
  );

  const telegramUrl = botUsername
    ? `https://t.me/${botUsername}`
    : null;

  return (
    <li className="rounded-lg border border-border bg-card">
      {/* Header: status + timestamp */}
      <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-2 text-xs">
        <div className="flex items-center gap-1.5">
          <StatusIcon status={run.status} />
          <span className="font-medium capitalize">
            {labelForStatus(run.status)}
          </span>
        </div>
        <time
          dateTime={run.created_at}
          className="text-muted-foreground"
          title={new Date(run.created_at).toLocaleString("id-ID")}
        >
          {formatRelative(run.created_at)}
        </time>
      </div>

      {/* Prompt */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="block w-full px-3 py-2 text-left text-sm hover:bg-muted/50"
      >
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Pertanyaan
        </div>
        <div className={cn("mt-0.5", !expanded && "line-clamp-2")}>
          {run.prompt}
        </div>
      </button>

      {/* Reply / status detail */}
      {expanded && (
        <div className="border-t border-border/50 px-3 py-2">
          {run.status === "pending" && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              <span>Menunggu Liana menjawab di Telegram...</span>
            </div>
          )}
          {run.status === "done" && run.reply_text && (
            <>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Jawaban Liana
              </div>
              <div className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">
                {run.reply_text}
              </div>
              {run.delivered_at && (
                <div className="mt-1 text-[10px] text-muted-foreground">
                  Terkirim {formatRelative(run.delivered_at)}
                </div>
              )}
            </>
          )}
          {run.status === "error" && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/5 p-2 text-xs text-destructive">
              <AlertCircle
                className="mt-0.5 h-3.5 w-3.5 flex-shrink-0"
                aria-hidden
              />
              <span>{run.error_message ?? "Terjadi error tidak diketahui."}</span>
            </div>
          )}

          {/* Footer actions */}
          {telegramUrl && (
            <div className="mt-2 flex justify-end">
              <a
                href={telegramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
              >
                Buka Telegram
                <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function StatusIcon({ status }: { status: LianaRun["status"] }) {
  if (status === "pending") {
    return (
      <Loader2
        className="h-3.5 w-3.5 animate-spin text-orange-500"
        aria-hidden
      />
    );
  }
  if (status === "done") {
    return <CheckCircle2 className="h-3.5 w-3.5 text-green-600" aria-hidden />;
  }
  return <AlertCircle className="h-3.5 w-3.5 text-destructive" aria-hidden />;
}

function labelForStatus(status: LianaRun["status"]): string {
  switch (status) {
    case "pending":
      return "Menunggu";
    case "done":
      return "Selesai";
    case "error":
      return "Gagal";
  }
}

function isRecent(iso: string, withinMs = 5 * 60_000): boolean {
  return Date.now() - new Date(iso).getTime() < withinMs;
}

function formatRelative(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.max(0, now - then);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}d lalu`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} menit lalu`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} jam lalu`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} hari lalu`;
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
  });
}
