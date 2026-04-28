"use client";

import * as React from "react";
import { Bot, Check, Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface AskLianaButtonProps {
  /** Prompt yang akan di-copy ke clipboard. */
  prompt: string;
  /** Label yang tampil di tombol. Default: 'Tanya Liana'. */
  label?: string;
  /** Variant button. Default 'outline' supaya tidak mendominasi UI. */
  variant?:
    | "default"
    | "outline"
    | "ghost"
    | "secondary"
    | "destructive"
    | "link";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  /** Tampilkan icon Bot kiri. Default true. */
  withIcon?: boolean;
}

/**
 * Tombol Liana yang copy prompt ke clipboard saat diklik, lalu menampilkan
 * toast supaya user tahu prompt sudah siap di-paste ke Telegram/WhatsApp.
 *
 * Disain MVP: belum ada chat embedded, copy prompt sudah cukup buat demo.
 */
export function AskLianaButton({
  prompt,
  label = "Tanya Liana",
  variant = "outline",
  size = "sm",
  className,
  withIcon = true,
}: AskLianaButtonProps) {
  const [copied, setCopied] = React.useState(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function handleCopy() {
    try {
      // Modern clipboard API (HTTPS / localhost only)
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
      setCopied(true);
      toast.success("Prompt disalin", {
        description: "Tinggal kirim ke Liana di Telegram.",
      });
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1800);
    } catch (err) {
      console.error("[AskLianaButton] copy failed:", err);
      toast.error("Gagal menyalin prompt", {
        description: "Coba salin manual: " + prompt,
      });
    }
  }

  const Icon = copied ? Check : withIcon ? Bot : Copy;

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={handleCopy}
      className={cn(
        "gap-1.5",
        copied && "border-success text-success",
        className,
      )}
      aria-label={`Salin prompt: ${label}`}
    >
      <Icon
        className={cn("h-3.5 w-3.5", !copied && withIcon && "text-primary")}
        aria-hidden
      />
      <span>{copied ? "Disalin!" : label}</span>
    </Button>
  );
}
