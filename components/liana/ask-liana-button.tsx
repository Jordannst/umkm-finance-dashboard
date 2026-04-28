"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bot, Check, Copy, Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useLianaUIOptional } from "./liana-ui-context";

export type AskLianaMode = "send" | "telegram" | "copy" | "auto";

export interface AskLianaButtonProps {
  /** Prompt yang akan dikirim ke Liana / di-copy. */
  prompt: string;
  /** Label yang tampil di tombol. Default: 'Tanya Liana'. */
  label?: string;
  /**
   * Mode tombol:
   * - 'send': POST ke /api/liana/ask, Liana respond langsung di Telegram.
   *   Perlu NEXT_PUBLIC_LIANA_SEND_ENABLED + Telegram chat_id sudah link.
   * - 'telegram': buka https://t.me/<bot>?text=<prompt> di tab baru.
   *   User pencet Send manual.
   * - 'copy': copy prompt ke clipboard.
   * - 'auto' (default): preferred 'send' kalau diaktifkan, lalu 'telegram',
   *   lalu 'copy' sebagai fallback paling kompatibel.
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

interface AskApiSuccess {
  ok: true;
  data: { runId: string };
}

interface AskApiError {
  ok: false;
  error: { code: string; message: string };
}
type AskApiResponse = AskApiSuccess | AskApiError;

/**
 * Tombol "Tanya Liana" — 3 mode integrasi.
 *
 * Resolusi mode (saat `mode='auto'`):
 *   1. 'send'     -> kalau NEXT_PUBLIC_LIANA_SEND_ENABLED truthy.
 *      POST ke /api/liana/ask, server forward ke OpenClaw /hooks/agent.
 *      Liana respond di Telegram tanpa user perlu klik Send.
 *   2. 'telegram' -> kalau NEXT_PUBLIC_OPENCLAW_BOT_USERNAME diset.
 *      Buka https://t.me/<bot>?text=<prompt> di tab baru. User pencet Send.
 *   3. 'copy'     -> fallback paling kompatibel. Copy prompt ke clipboard.
 *
 * Caller bisa override resolusi auto dengan kasih `mode` eksplisit.
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
  const router = useRouter();
  const lianaUI = useLianaUIOptional();
  const [done, setDone] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Resolve env config (only di client). Empty string juga di-treat
  // sebagai "tidak ada".
  const botUsername = (
    process.env.NEXT_PUBLIC_OPENCLAW_BOT_USERNAME ?? ""
  ).trim();
  const sendEnabled =
    (process.env.NEXT_PUBLIC_LIANA_SEND_ENABLED ?? "").trim() === "1" ||
    (process.env.NEXT_PUBLIC_LIANA_SEND_ENABLED ?? "")
      .trim()
      .toLowerCase() === "true";

  const resolvedMode: "send" | "telegram" | "copy" =
    mode === "auto"
      ? sendEnabled
        ? "send"
        : botUsername
          ? "telegram"
          : "copy"
      : mode;

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

  async function handleSend() {
    if (pending) return;
    setPending(true);

    // Push pill instan supaya user dapet feedback visual sebelum API
    // selesai. Pill awalnya "sending" (loading state), lalu transition
    // ke "thinking" begitu runId di-set, lalu "done" via Realtime.
    // Kalau di route tanpa provider (unlikely tapi safe), pillId = null.
    const pillId = lianaUI?.addPill(prompt) ?? null;

    try {
      const res = await fetch("/api/liana/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      let body: AskApiResponse | null = null;
      try {
        body = (await res.json()) as AskApiResponse;
      } catch {
        body = null;
      }

      if (res.ok && body?.ok) {
        // Sukses — link runId ke pill supaya pill nge-track lifecycle
        // run lewat Realtime (pending → done).
        if (pillId && lianaUI) {
          lianaUI.setPillRunId(pillId, body.data.runId);
        } else {
          // Fallback toast kalau pill stack gak available.
          toast.success("Liana sedang menjawab di Telegram", {
            description: "Buka Telegram untuk lihat balasan Liana.",
          });
        }
        flashDone();
        return;
      }

      // Error mapping per code
      const code = body && !body.ok ? body.error?.code : undefined;
      const message =
        (body && !body.ok ? body.error?.message : undefined) ??
        "Gagal menghubungi Liana.";

      // Set pill error supaya feedback visual muncul juga di pill stack.
      // Toast tetap dikirim untuk error yang butuh action button (Settings).
      if (pillId && lianaUI) {
        lianaUI.setPillError(pillId, friendlyErrorFor(code, res.status, message));
      }

      if (res.status === 401) {
        toast.error("Sesi tidak valid", {
          description: "Silakan login ulang.",
        });
        return;
      }

      if (code === "telegram_not_linked" || res.status === 412) {
        toast.error("Telegram belum dihubungkan", {
          description: "Hubungkan akun Telegram di Settings dulu.",
          action: {
            label: "Buka Settings",
            onClick: () => router.push("/settings"),
          },
        });
        return;
      }

      if (res.status === 429) {
        const retry = res.headers.get("Retry-After");
        toast.error("Liana sedang sibuk", {
          description: retry
            ? `Coba lagi dalam ${retry} detik.`
            : "Coba lagi sebentar.",
        });
        return;
      }

      if (code === "not_configured" || res.status === 503) {
        toast.error("Integrasi Liana belum aktif", {
          description: "Mode send butuh konfigurasi server. Coba copy prompt.",
        });
        // Fallback otomatis ke clipboard supaya user tetap bisa lanjut
        void handleCopy();
        return;
      }

      console.error("[AskLianaButton] /api/liana/ask error:", res.status, body);
      toast.error("Gagal mengirim ke Liana", { description: message });
    } catch (err) {
      console.error("[AskLianaButton] network error:", err);
      if (pillId && lianaUI) {
        lianaUI.setPillError(pillId, "Cek koneksi internet, lalu coba lagi.");
      }
      toast.error("Gagal menghubungi Liana", {
        description: "Cek koneksi internet, lalu coba lagi.",
      });
    } finally {
      setPending(false);
    }
  }

  /**
   * Pesan error pendek untuk pill (max ~50 char). Toast dapat copy lebih
   * panjang + action button.
   */
  function friendlyErrorFor(
    code: string | undefined,
    status: number,
    fallback: string,
  ): string {
    if (status === 401) return "Sesi tidak valid";
    if (code === "telegram_not_linked" || status === 412) {
      return "Telegram belum dihubungkan";
    }
    if (status === 429) return "Liana sedang sibuk, coba lagi";
    if (code === "not_configured" || status === 503) {
      return "Integrasi belum aktif";
    }
    return fallback.length > 60 ? fallback.slice(0, 57) + "..." : fallback;
  }

  const onClick =
    resolvedMode === "send"
      ? handleSend
      : resolvedMode === "telegram"
        ? handleTelegramOpen
        : handleCopy;

  // Icon pilih sesuai state + mode.
  // - pending -> Loader2 (mode 'send' saja, fetching API)
  // - done    -> Check (semua mode)
  // - send / telegram -> Send (paper plane, aksi "kirim")
  // - copy + withIcon -> Bot (branded Liana)
  // - copy tanpa withIcon -> Copy (utility ikon)
  const ActiveIcon = pending
    ? Loader2
    : done
      ? Check
      : resolvedMode === "send" || resolvedMode === "telegram"
        ? Send
        : withIcon
          ? Bot
          : Copy;

  const doneLabel =
    resolvedMode === "send"
      ? "Terkirim!"
      : resolvedMode === "telegram"
        ? "Telegram dibuka!"
        : "Disalin!";
  const ariaLabel =
    resolvedMode === "send"
      ? `Kirim ke Liana: ${label}`
      : resolvedMode === "telegram"
        ? `Kirim ke Liana di Telegram: ${label}`
        : `Salin prompt: ${label}`;

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={onClick}
      disabled={pending}
      className={cn(
        "gap-1.5",
        done && "border-success text-success",
        className,
      )}
      aria-label={ariaLabel}
    >
      <ActiveIcon
        className={cn(
          "h-3.5 w-3.5",
          pending && "animate-spin",
          !done && !pending && withIcon && "text-primary",
        )}
        aria-hidden
      />
      <span>{done ? doneLabel : label}</span>
    </Button>
  );
}
