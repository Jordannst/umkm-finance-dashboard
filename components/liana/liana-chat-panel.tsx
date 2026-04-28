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
import type { LianaRun } from "@/hooks/use-liana-runs";
import { formatLatencyBreakdown } from "@/lib/finance/liana/format";
import { cn } from "@/lib/utils";

import { useLianaUI } from "./liana-ui-context";
import { TypingDots } from "./typing-dots";

interface LianaChatPanelProps {
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
 * Sumber state: `useLianaUI()` context — `runs`, `chatPanelOpen`,
 * `selectedRunId`. Pill stack juga consume context yang sama, jadi
 * klik "Lihat" di pill → set selectedRunId + open panel → panel
 * scroll-into-view + flash highlight ke row yang sesuai.
 */
export function LianaChatPanel({ botUsername }: LianaChatPanelProps) {
  const {
    runs,
    pendingCount,
    loading,
    chatPanelOpen: open,
    setChatPanelOpen: setOpen,
    selectedRunId,
    setSelectedRunId,
  } = useLianaUI();
  const listRef = React.useRef<HTMLUListElement | null>(null);

  // Saat selectedRunId di-set (lewat klik "Lihat" pada pill), scroll ke
  // <li data-run-id> yang sesuai dan flash highlight 1x via class CSS.
  // Cleanup: setelah animasi flash selesai, clear selectedRunId supaya
  // klik tombol yang sama lagi tetap re-trigger.
  React.useEffect(() => {
    if (!selectedRunId || !open) return;
    // Tunggu 1 frame supaya panel sudah render setelah open=true.
    const raf = requestAnimationFrame(() => {
      const root = listRef.current;
      if (!root) return;
      const target = root.querySelector<HTMLLIElement>(
        `[data-run-id="${selectedRunId}"]`,
      );
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      target.classList.add("liana-anim-row-flash");
      // Hapus class setelah animasi selesai (1.5s) supaya bisa di-trigger lagi.
      const timeout = setTimeout(() => {
        target.classList.remove("liana-anim-row-flash");
        setSelectedRunId(null);
      }, 1600);
      // Simpan timeout di-ref dengan cleanup di outer effect bisa risky,
      // jadi kita ikat di closure: cleanup outer akan tetap clear.
      return () => clearTimeout(timeout);
    });
    return () => cancelAnimationFrame(raf);
  }, [selectedRunId, open, setSelectedRunId]);

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
        onClick={() => setOpen(!open)}
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
              <ul ref={listRef} className="space-y-3">
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
  const telegramUrl = botUsername ? `https://t.me/${botUsername}` : null;

  return (
    <li
      data-run-id={run.id}
      className="rounded-lg border border-border bg-card"
    >
      {/* Header: status + timestamp + latency breakdown */}
      <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-2 text-xs">
        <div className="flex items-center gap-1.5">
          <StatusIcon status={run.status} />
          <span className="font-medium capitalize">
            {labelForStatus(run.status)}
          </span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          {(() => {
            const breakdown = formatLatencyBreakdown(run);
            return breakdown ? (
              <>
                <span
                  className="hidden tabular-nums sm:inline"
                  title="Network = waktu dashboard → OpenClaw. LLM = Liana memproses + tools."
                >
                  {breakdown}
                </span>
                <span aria-hidden className="hidden sm:inline">
                  •
                </span>
              </>
            ) : null;
          })()}
          <time
            dateTime={run.created_at}
            title={new Date(run.created_at).toLocaleString("id-ID")}
          >
            {formatRelative(run.created_at)}
          </time>
        </div>
      </div>

      {/* Prompt — always visible */}
      <div className="px-3 py-2 text-sm">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Pertanyaan
        </div>
        <div className="mt-0.5 whitespace-pre-wrap">{run.prompt}</div>
      </div>

      {/* Reply / status detail — always visible */}
      <div className="border-t border-border/50 px-3 py-2">
        {run.status === "pending" && (
          <div className="flex items-center gap-2 text-xs italic text-muted-foreground">
            <span>Liana sedang mengetik</span>
            <TypingDots />
          </div>
        )}
        {run.status === "done" && run.reply_text && (
          <>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Jawaban Liana
            </div>
            <ReplyContent text={run.reply_text} />
            {run.delivered_at && (
              <div className="mt-2 text-[10px] text-muted-foreground">
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
            <span>
              {run.error_message ?? "Terjadi error tidak diketahui."}
            </span>
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
              Buka di Telegram
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          </div>
        )}
      </div>
    </li>
  );
}

/**
 * Render reply text Liana dengan minimal markdown:
 * - **bold** → <strong>
 * - "1. " / "- " / "• " → numbered / bulleted list
 * - whitespace + line breaks dipertahankan
 *
 * Bukan markdown parser full — cukup untuk format Liana yang umum.
 * Tujuan: gak butuh dependency tambahan, render aman tanpa
 * dangerouslySetInnerHTML.
 */
type ReplyBlock =
  | { kind: "paragraph"; lines: string[] }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] };

function parseReplyBlocks(text: string): ReplyBlock[] {
  const lines = text.split(/\r?\n/);
  const out: ReplyBlock[] = [];
  let cur: ReplyBlock | null = null;

  for (const raw of lines) {
    const line = raw.trimEnd();
    const ulMatch = /^\s*(?:[-•])\s+(.*)$/.exec(line);
    const olMatch = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);

    if (ulMatch) {
      if (!cur || cur.kind !== "ul") {
        if (cur) out.push(cur);
        cur = { kind: "ul", items: [] };
      }
      cur.items.push(ulMatch[1]);
    } else if (olMatch) {
      if (!cur || cur.kind !== "ol") {
        if (cur) out.push(cur);
        cur = { kind: "ol", items: [] };
      }
      cur.items.push(olMatch[2]);
    } else if (line === "") {
      if (cur) {
        out.push(cur);
        cur = null;
      }
    } else {
      if (!cur || cur.kind !== "paragraph") {
        if (cur) out.push(cur);
        cur = { kind: "paragraph", lines: [] };
      }
      cur.lines.push(line);
    }
  }
  if (cur) out.push(cur);
  return out;
}

function ReplyContent({ text }: { text: string }) {
  const blocks = React.useMemo(() => parseReplyBlocks(text), [text]);

  return (
    <div className="mt-1 space-y-2 text-sm leading-relaxed">
      {blocks.map((block, i) => {
        if (block.kind === "ul") {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {block.items.map((it, j) => (
                <li key={j}>{renderInline(it)}</li>
              ))}
            </ul>
          );
        }
        if (block.kind === "ol") {
          return (
            <ol key={i} className="list-decimal space-y-1 pl-5">
              {block.items.map((it, j) => (
                <li key={j}>{renderInline(it)}</li>
              ))}
            </ol>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap">
            {block.lines.map((ln, j) => (
              <React.Fragment key={j}>
                {j > 0 && <br />}
                {renderInline(ln)}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

/**
 * Inline markdown: **bold** → <strong>. Aman, no HTML injection.
 */
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(<strong key={key++}>{match[1]}</strong>);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
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
