import "server-only";

import { formatRupiah } from "@/lib/finance/format";
import { sendTelegramMessage } from "@/lib/telegram/send-message";
import type { Order, OrderItem } from "@/types/sorea";

/**
 * Phase 4B: notify customer di Telegram saat payment_status order berubah
 * jadi 'paid'. Dipanggil fire-and-forget dari processPakasirCallback supaya
 * webhook respond ke Pakasir cepat (< 1 detik) tanpa nunggu Telegram API.
 *
 * Why dashboard kirim langsung, bukan via Liana / OpenClaw image bridge?
 * - OpenClaw image content → Telegram bridge tidak reliable (Apr 2026:
 *   Liana harus convert PNG → GIF manual via Python venv tiap kali).
 * - Webhook fire saat Liana mungkin tidak running / busy / quota habis.
 * - Same pattern dengan prompt-echo Path 3 (sudah proven works).
 *
 * Best-effort: gagal di-log tapi tidak throw. Webhook tetap return 200
 * ke Pakasir supaya tidak retry.
 */

export interface NotifyOrderPaidParams {
  /** Order yang sudah di-update jadi paid. */
  order: Pick<
    Order,
    | "order_code"
    | "customer_name"
    | "fulfillment_method"
    | "address"
    | "notes"
    | "order_total_amount"
    | "payment_amount"
    | "customer_contact_channel"
    | "customer_contact_id"
  >;
  /** Items order untuk recap. Optional — kalau tidak ada, skip recap. */
  items?: Pick<OrderItem, "qty" | "product_name" | "subtotal">[];
}

export interface NotifyOrderPaidResult {
  ok: boolean;
  /** Skipped karena order tidak punya channel kontak. */
  skipped?: "no_contact" | "unsupported_channel";
  /** Error dari Telegram API (kalau ada). */
  errorMessage?: string;
}

/**
 * Cek apa order eligible auto-notify, lalu kirim message konfirmasi.
 * Aman dipanggil tanpa await (fire-and-forget) — tidak throw.
 */
export async function notifyOrderPaid(
  params: NotifyOrderPaidParams,
): Promise<NotifyOrderPaidResult> {
  const { order, items } = params;

  // Skip kalau order tidak punya channel kontak (mis. dibuat dari dashboard
  // owner, bukan via chat).
  if (!order.customer_contact_channel || !order.customer_contact_id) {
    return { ok: false, skipped: "no_contact" };
  }

  // Phase 4B saat ini cuma support Telegram. WhatsApp di-skip dulu.
  if (order.customer_contact_channel !== "telegram") {
    console.info(
      `[notifyOrderPaid] skip ${order.order_code}: channel ` +
        `${order.customer_contact_channel} belum di-support.`,
    );
    return { ok: false, skipped: "unsupported_channel" };
  }

  const text = formatOrderPaidMessage({ order, items });
  const sendResult = await sendTelegramMessage({
    chatId: order.customer_contact_id,
    text,
    // Plain text — gak pakai HTML/Markdown supaya nama produk dengan
    // karakter spesial gak break parsing dan kita gak perlu escape.
  });

  if (!sendResult.ok) {
    console.warn(
      `[notifyOrderPaid] failed ${order.order_code} to ${order.customer_contact_id}: ` +
        `${sendResult.errorMessage}`,
    );
    return { ok: false, errorMessage: sendResult.errorMessage };
  }

  console.info(
    `[notifyOrderPaid] ok ${order.order_code} → telegram chat_id=${order.customer_contact_id}`,
  );
  return { ok: true };
}

/**
 * Format pesan konfirmasi pembayaran untuk customer.
 * Plain text Telegram-friendly, gak pakai parse_mode.
 */
function formatOrderPaidMessage(params: NotifyOrderPaidParams): string {
  const { order, items } = params;
  const lines: string[] = [];

  lines.push(`✅ Pembayaran Diterima`);
  lines.push("");
  lines.push(`Order: ${order.order_code}`);
  lines.push(`Atas nama: ${order.customer_name}`);

  if (items && items.length > 0) {
    lines.push("");
    for (const it of items) {
      lines.push(
        `• ${it.qty}× ${it.product_name} — ${formatRupiah(Number(it.subtotal))}`,
      );
    }
  }

  lines.push("");
  lines.push(`Total: ${formatRupiah(Number(order.order_total_amount))}`);
  lines.push(`Metode: ${order.fulfillment_method}`);
  if (order.address) {
    lines.push(`Alamat: ${order.address}`);
  }
  if (order.notes) {
    lines.push(`Catatan: ${order.notes}`);
  }

  lines.push("");
  lines.push(`Pesanan kamu akan segera diproses oleh tim kami.`);
  lines.push(`Terima kasih sudah belanja! 🙌`);

  return lines.join("\n");
}
