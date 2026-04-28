"use client";

import * as React from "react";
import { AlertCircle, ArrowRight, Bot, Sparkles, X } from "lucide-react";

import { elapsedToPhase } from "@/lib/finance/liana/format";
import { cn } from "@/lib/utils";

import type { PillView } from "./liana-ui-context";

interface LianaStatusPillProps {
  pill: PillView;
  /** Klik tombol "Lihat" / "Detail" — caller buka chat panel + scroll ke run. */
  onLihatClick: () => void;
  /** Klik X — dismiss pill (request tetap jalan di background). */
  onDismiss: () => void;
  /** Hover state report — caller pause auto-dismiss timer. */
  onHoverChange: (hovered: boolean) => void;
}

/**
 * Visual status pill — V2 "Liana Personality" design.
 *
 * Layout: [avatar] [Liana <newline> status text] [action btn] [X]
 *
 * State-driven styling:
 * - sending  → orange bg, bouncing avatar, "Liana terima pesannya..."
 * - thinking → orange bg, thinking dots, "Liana sedang menyusun jawaban"
 * - done     → green bg w/ glow + sparkle burst, "Liana sudah balas! Cek yuk"
 * - error    → red bg, "Liana belum bisa balas. <message>"
 */
export function LianaStatusPill({
  pill,
  onLihatClick,
  onDismiss,
  onHoverChange,
}: LianaStatusPillProps) {
  const isSending = pill.status === "sending";
  const isThinking = pill.status === "thinking";
  const isDone = pill.status === "done";
  const isError = pill.status === "error";

  // Cycling tick — hanya jalan saat status='thinking' biar labels +
  // avatar icon transition over time. 500ms cukup buat re-evaluate phase
  // tanpa overcost render. Cleanup + restart natural saat status berubah.
  //
  // Simpan `now` di state (bukan Date.now() inline di render body) supaya
  // pure: render hanya read state, tidak panggil impure Date.now().
  // Initial value dengan lazy initializer — dievaluasi sekali saat mount.
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!isThinking) return;
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 500);
    return () => clearInterval(interval);
  }, [isThinking]);

  // Phase computed dari elapsed time — hanya relevan saat thinking.
  // Label mulai dari "Liana memikirkan" (0–3s) sampai "Hampir selesai" (>15s).
  const elapsedMs = isThinking ? now - pill.createdAt : 0;
  const phase = elapsedToPhase(elapsedMs);

  // Status text per state. Untuk thinking, lowercase phase.label biar
  // smooth setelah "Liana " prefix (rendered via <strong>Liana</strong>).
  const statusText = isSending
    ? "terima pesannya..."
    : isThinking
      ? phase.label.replace(/^Liana\s+/, "").toLowerCase()
      : isDone
        ? "sudah balas! Cek yuk"
        : pill.errorMessage ?? "belum bisa balas saat ini";

  const AvatarIcon = isDone
    ? Sparkles
    : isError
      ? AlertCircle
      : isThinking
        ? phase.icon
        : Bot;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      onFocus={() => onHoverChange(true)}
      onBlur={() => onHoverChange(false)}
      title={pill.promptPreview}
      className={cn(
        "liana-anim-enter pointer-events-auto relative inline-flex items-center gap-2.5 rounded-2xl border-[1.5px] py-2.5 pl-2.5 pr-3 shadow-[0_8px_24px_rgba(251,146,60,0.25)] transition-colors duration-300 ease-out",
        // Default (sending/thinking) — orange
        "border-orange-400 bg-gradient-to-br from-orange-50 to-orange-200",
        // Done — green w/ glow ring (animation kicks 2x cycle)
        isDone &&
          "liana-anim-pulse-green border-green-500 bg-gradient-to-br from-green-50 to-green-200 shadow-[0_8px_24px_rgba(34,197,94,0.3)]",
        // Error — red
        isError &&
          "border-red-500 bg-gradient-to-br from-red-50 to-red-200 shadow-[0_8px_24px_rgba(239,68,68,0.25)]",
      )}
    >
      {/* Sparkle burst (done state only) */}
      {isDone && (
        <>
          <span
            aria-hidden
            className="liana-anim-sparkle pointer-events-none absolute bottom-full left-[22%] h-1.5 w-1.5 rounded-full bg-amber-400"
            style={
              {
                "--liana-spark-dx": "-16px",
                animationDelay: "0s",
              } as React.CSSProperties
            }
          />
          <span
            aria-hidden
            className="liana-anim-sparkle pointer-events-none absolute bottom-full left-1/2 h-1.5 w-1.5 rounded-full bg-amber-400"
            style={
              {
                "--liana-spark-dx": "0px",
                animationDelay: "0.4s",
              } as React.CSSProperties
            }
          />
          <span
            aria-hidden
            className="liana-anim-sparkle pointer-events-none absolute bottom-full left-[78%] h-1.5 w-1.5 rounded-full bg-amber-400"
            style={
              {
                "--liana-spark-dx": "16px",
                animationDelay: "0.8s",
              } as React.CSSProperties
            }
          />
        </>
      )}

      {/* Avatar (rounded square 32x32) */}
      <div
        className={cn(
          "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[10px] text-white shadow-md",
          // Default — Liana orange
          "bg-gradient-to-br from-orange-500 to-orange-700",
          isDone && "bg-gradient-to-br from-green-500 to-green-700",
          isError && "bg-gradient-to-br from-red-500 to-red-700",
          (isSending || isThinking) && "liana-anim-bounce-tiny",
        )}
        aria-hidden
      >
        <AvatarIcon className="h-4 w-4" strokeWidth={2.5} />
      </div>

      {/* Body — 2-line text "Liana / status" */}
      <div className="flex min-w-0 flex-col leading-tight">
        <strong
          className={cn(
            "text-[13px] font-bold tracking-tight",
            // Default — orange-950
            "text-orange-950",
            isDone && "text-green-900",
            isError && "text-red-900",
          )}
        >
          Liana
        </strong>
        <span
          className={cn(
            "max-w-[200px] truncate text-[11px] font-medium opacity-85",
            "text-orange-900",
            isDone && "text-green-800",
            isError && "text-red-800",
          )}
        >
          {statusText}
          {isThinking && <ThinkingDots />}
        </span>
      </div>

      {/* Action button (only for done / error) */}
      {(isDone || isError) && (
        <button
          type="button"
          onClick={onLihatClick}
          className={cn(
            "ml-1 inline-flex flex-shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-all hover:scale-105 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
            isDone &&
              "bg-gradient-to-br from-green-500 to-green-700 focus-visible:ring-green-500",
            isError &&
              "bg-gradient-to-br from-red-500 to-red-700 focus-visible:ring-red-500",
          )}
          aria-label={isDone ? "Lihat jawaban Liana" : "Lihat detail error"}
        >
          {isDone ? "Lihat" : "Detail"}
          <ArrowRight className="h-3 w-3" aria-hidden />
        </button>
      )}

      {/* Dismiss (X) — selalu ada kecuali kalau loading state pertama (1.5s) */}
      <button
        type="button"
        onClick={onDismiss}
        className={cn(
          "ml-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full opacity-60 transition-all hover:bg-black/5 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
          "text-orange-900 focus-visible:ring-orange-500",
          isDone && "text-green-900 focus-visible:ring-green-500",
          isError && "text-red-900 focus-visible:ring-red-500",
        )}
        aria-label="Tutup notifikasi"
      >
        <X className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
      </button>
    </div>
  );
}

function ThinkingDots() {
  return (
    <span aria-hidden className="ml-0.5 inline-flex items-center gap-0.5">
      <span
        className="liana-anim-thinking-dot inline-block h-1 w-1 rounded-full bg-current"
        style={{ animationDelay: "0s" }}
      />
      <span
        className="liana-anim-thinking-dot inline-block h-1 w-1 rounded-full bg-current"
        style={{ animationDelay: "0.2s" }}
      />
      <span
        className="liana-anim-thinking-dot inline-block h-1 w-1 rounded-full bg-current"
        style={{ animationDelay: "0.4s" }}
      />
    </span>
  );
}
