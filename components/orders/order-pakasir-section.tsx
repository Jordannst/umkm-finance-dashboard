"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Loader2, QrCode, RefreshCw, Zap } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { formatRupiah } from "@/lib/finance/format";
import type { QrisDisplayPayload } from "@/types/sorea";

interface OrderPakasirSectionProps {
  orderId: string;
  /** Current payment_status (drives whether QR can be generated) */
  paymentStatus: string;
  /** Total normal pesanan (untuk display) */
  orderTotal: number;
  /** Nominal yang akan di-charge ke Pakasir (mis. 600 demo) */
  paymentAmount: number;
  /** True jika dev simulate endpoint diizinkan (NODE_ENV != production atau ALLOW_PAKASIR_SIMULATE=1) */
  showSimulate: boolean;
  /** True jika env Pakasir lengkap (project_id + api_key set di server) */
  pakasirConfigured: boolean;
}

/**
 * Section di /orders/[id] untuk generate + display QRIS Pakasir.
 *
 * UX flow:
 * 1. Belum generate → tombol "Generate QRIS Demo Rp600"
 * 2. Loading → spinner
 * 3. Generated → QR image, expired_at countdown, refresh button, simulate button (dev only)
 * 4. Sudah paid → hide section (parent component yang decide kapan hide via paymentStatus prop)
 */
export function OrderPakasirSection({
  orderId,
  paymentStatus,
  orderTotal,
  paymentAmount,
  showSimulate,
  pakasirConfigured,
}: OrderPakasirSectionProps) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [simPending, setSimPending] = React.useState(false);
  const [display, setDisplay] = React.useState<QrisDisplayPayload | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  const isPaid = paymentStatus === "paid";

  async function generate() {
    if (pending) return;
    setPending(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/orders/${orderId}/payment/pakasir/create`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        },
      );
      const json = (await res.json().catch(() => null)) as
        | { ok: true; data: { display: QrisDisplayPayload } }
        | { ok: false; error?: { message?: string } }
        | null;
      if (!res.ok || !json?.ok) {
        const msg =
          (json && !json.ok && json.error?.message) ||
          "Gagal generate QRIS Pakasir.";
        setErr(msg);
        toast.error(msg);
        return;
      }
      setDisplay(json.data.display);
      toast.success("QRIS demo siap.");
    } catch (e) {
      console.error("[OrderPakasirSection] generate error:", e);
      const msg = "Tidak bisa menghubungi server. Periksa koneksi.";
      setErr(msg);
      toast.error(msg);
    } finally {
      setPending(false);
    }
  }

  async function simulate() {
    if (simPending) return;
    setSimPending(true);
    try {
      const res = await fetch(
        `/api/orders/${orderId}/payment/pakasir/simulate`,
        { method: "POST" },
      );
      const json = (await res.json().catch(() => null)) as
        | { ok: true; data: { updated: boolean } }
        | { ok: false; error?: { message?: string } }
        | null;
      if (!res.ok || !json?.ok) {
        toast.error(
          (json && !json.ok && json.error?.message) || "Simulate gagal.",
        );
        return;
      }
      toast.success(
        json.data.updated
          ? "Order ditandai paid (simulate)."
          : "Order sudah paid sebelumnya.",
      );
      router.refresh();
    } catch (e) {
      console.error("[OrderPakasirSection] simulate error:", e);
      toast.error("Tidak bisa menghubungi server.");
    } finally {
      setSimPending(false);
    }
  }

  // Auto-poll: setelah QR ke-generate, polling /api/orders/[id] tiap 5
  // detik untuk auto-refresh kalau webhook udah datang. Stop kalau paid
  // atau component unmount.
  React.useEffect(() => {
    if (!display || isPaid) return;
    const interval = setInterval(() => {
      router.refresh();
    }, 5000);
    return () => clearInterval(interval);
  }, [display, isPaid, router]);

  if (isPaid) {
    return (
      <div className="rounded-lg border bg-emerald-50 dark:bg-emerald-950/30 p-4 text-sm">
        <p className="font-medium text-emerald-700 dark:text-emerald-400">
          ✓ Pembayaran sudah lunas
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Order ini sudah ditandai paid via Pakasir.
        </p>
      </div>
    );
  }

  if (!pakasirConfigured) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-4 text-sm">
        <p className="font-medium text-amber-800 dark:text-amber-400">
          ⚠ Pakasir belum dikonfigurasi
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Set <code className="font-mono">PAKASIR_PROJECT_ID</code> dan{" "}
          <code className="font-mono">PAKASIR_API_KEY</code> di env server
          untuk enable QRIS demo.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Display nominal */}
      <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-muted-foreground">Total pesanan</span>
          <span className="font-medium tabular-nums">
            {formatRupiah(orderTotal)}
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-muted-foreground">
            Nominal QRIS demo
          </span>
          <span className="font-mono text-base font-bold text-primary tabular-nums">
            {formatRupiah(paymentAmount)}
          </span>
        </div>
        <p className="pt-1 text-[11px] italic text-muted-foreground">
          Demo charge minimal Pakasir Rp600. Total normal pesanan tetap{" "}
          {formatRupiah(orderTotal)}.
        </p>
      </div>

      {/* QR display or generate button */}
      {!display ? (
        <Button
          onClick={generate}
          disabled={pending}
          className="w-full"
          size="lg"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <QrCode className="h-4 w-4" aria-hidden />
          )}
          Generate QRIS Demo {formatRupiah(paymentAmount)}
        </Button>
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg border bg-white p-4 flex flex-col items-center gap-3">
            {display.qrDataUrl ? (
              // qrDataUrl adalah data:image/png base64 — `<img>` lebih
              // simple drpd Next/Image untuk data URL.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={display.qrDataUrl}
                alt="QRIS untuk pembayaran"
                className="h-56 w-56"
              />
            ) : (
              <div className="flex h-56 w-56 items-center justify-center rounded bg-muted text-xs text-muted-foreground">
                QR tidak ter-render
              </div>
            )}
            <div className="text-center">
              <p className="font-mono text-base font-bold tabular-nums">
                {formatRupiah(display.amount)}
              </p>
              {display.expiredAt && (
                <p className="text-xs text-muted-foreground">
                  Berlaku sampai {formatExpiry(display.expiredAt)}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              size="sm"
              onClick={generate}
              disabled={pending}
              className="sm:flex-1"
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Generate Ulang
            </Button>
            {showSimulate && (
              <Button
                variant="secondary"
                size="sm"
                onClick={simulate}
                disabled={simPending}
                className="sm:flex-1"
                title="Dev only: paksa order jadi paid tanpa real bayar"
              >
                {simPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Zap className="h-3.5 w-3.5" />
                )}
                Simulate Paid
              </Button>
            )}
          </div>

          <p className="text-[11px] text-center italic text-muted-foreground">
            Status pembayaran auto-refresh tiap 5 detik. Scan QR pakai
            aplikasi e-wallet/m-banking yang support QRIS.
          </p>
        </div>
      )}

      {/* Error display */}
      {err && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs">
          <p className="font-medium text-destructive">Error</p>
          <p className="mt-0.5 text-muted-foreground">{err}</p>
        </div>
      )}
    </div>
  );
}

function formatExpiry(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

// Suppress next/image unused (we use raw img tag for data URL)
void Image;
