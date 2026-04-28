"use client";

import * as React from "react";
import { Bot, Check, Copy, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AskLianaMode = "telegram" | "copy" | "auto";

export interface AskLianaButtonProps {
  /** Prompt yang akan dikirim ke Liana / di-copy. */
  prompt: string;
  /** Label yang tampil di tombol. Default: 'Tanya Liana'. */
  label?: string;
  /**
   * Mode tombol:
   * - 'telegram' (preferred): buka https://t.me/<bot>?text=<prompt>
   *   sehingga user langsung lihat prompt di chat Liana, tinggal pencet Send.
   * - 'copy': copy prompt ke clipboard, user paste manual.
   * - 'auto' (default): pakai 'telegram' kalau env
   *   NEXT_PUBLIC_OPENCLAW_BOT_USERNAME ada, fallback ke 'copy'.
   */
  mode?: AskLianaMode;
  variant?:
    | "default"
    | "outline"
    | "ghost"
    | "secondary"
    | "destructive"
    | "link";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  /** Tampilkan icon kiri. Default true. */
  withIcon?: boolean;
}

/**
 * Tombol "Tanya Liana".
 *
 * - Mode `telegram` (default kalau bot username di-set): klik tombol membuka
 *   tab baru ke `https://t.me/<bot>?text=<prompt>`. User tinggal pencet Send.
 *   Hilangkan langkah copy-paste sepenuhnya.
 * - Mode `copy`: legacy fallback, copy prompt ke clipboard.
 */
export function AskLianaButton({
  prompt,
  label = "Tanya Liana",
  mode = "auto",
  variant = "outline",
  size = "sm",
  className,
  withIcon = true,
}: AskLianaButtonProps) {
  const [done, setDone] = React.useState(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Resolve bot username dari env (only di client). Empty string juga
  // di-treat sebagai "tidak ada".
  const botUsername = (
    process.env.NEXT_PUBLIC_OPENCLAW_BOT_USERNAME ?? ""
  ).trim();
  const resolvedMode: "telegram" | "copy" =
    mode === "auto" ? (botUsername ? "telegram" : "copy") : mode;

  function flashDone() {
    setDone(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDone(false), 1800);
  }

  async function handleCopy() {
    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard?.writeText
      ) {
        await navigator.clipboard.writeText(prompt);
      } else {
        // Fallback: textarea + execCommand
        const textarea = document.createElement("textarea");
        textarea.value = prompt;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      toast.success("Prompt disalin", {
        description: "Tinggal kirim ke Liana di Telegram.",
      });
      flashDone();
    } catch (err) {
      console.error("[AskLianaButton] copy failed:", err);
      toast.error("Gagal menyalin prompt", {
        description: "Coba salin manual: " + prompt,
      });
    }
  }

  function handleTelegramOpen() {
    if (!botUsername) {
      // Safety: kalau mode dipaksa 'telegram' tapi env kosong
      void handleCopy();
      return;
    }
    const url = `https://t.me/${botUsername}?text=${encodeURIComponent(prompt)}`;
    const win =
      typeof window !== "undefined"
        ? window.open(url, "_blank", "noopener,noreferrer")
        : null;

    if (!win) {
      // Popup blocker / browser policy. Fallback otomatis ke copy.
      console.warn(
        "[AskLianaButton] window.open blocked, fallback to clipboard",
      );
      void handleCopy();
      return;
    }
    toast.success("Membuka Liana di Telegram", {
      description: "Tinggal pencet Send di Telegram.",
    });
    flashDone();
  }

  const onClick =
    resolvedMode === "telegram" ? handleTelegramOpen : handleCopy;

  // Icon pilih sesuai state + mode.
  // - done    -> Check (semua mode)
  // - telegram -> Send (icon paper plane, sesuai aksi "kirim")
  // - copy + withIcon -> Bot (branded Liana)
  // - copy tanpa withIcon -> Copy (utility ikon)
  const ActiveIcon = done
    ? Check
    : resolvedMode === "telegram"
      ? Send
      : withIcon
        ? Bot
        : Copy;

  const doneLabel =
    resolvedMode === "telegram" ? "Telegram dibuka!" : "Disalin!";
  const ariaLabel =
    resolvedMode === "telegram"
      ? `Kirim ke Liana di Telegram: ${label}`
      : `Salin prompt: ${label}`;

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={onClick}
      className={cn(
        "gap-1.5",
        done && "border-success text-success",
        className,
      )}
      aria-label={ariaLabel}
    >
      <ActiveIcon
        className={cn("h-3.5 w-3.5", !done && withIcon && "text-primary")}
        aria-hidden
      />
      <span>{done ? doneLabel : label}</span>
    </Button>
  );
}
