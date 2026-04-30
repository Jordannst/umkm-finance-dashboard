#!/usr/bin/env node
/**
 * MCP Server untuk Dashboard Keuangan UMKM.
 *
 * Dipakai oleh OpenClaw (Liana) untuk menambah skill keuangan + order
 * (order chat → invoice + QRIS Pakasir Phase 4):
 *
 *  Finance (Phase 1):
 *  1. umkm_catat_pemasukan_pengeluaran
 *  2. umkm_catat_piutang_baru
 *  3. umkm_catat_pembayaran_piutang
 *  4. umkm_ambil_rekap
 *  5. umkm_health_check
 *  6. umkm_notify_dashboard (callback ke dashboard setelah Liana balas)
 *
 *  Order chat (Phase 4):
 *  7. umkm_catalog_search        — cari produk by name/SKU/category
 *  8. umkm_create_order          — buat order dari chat
 *  9. umkm_generate_qris         — generate QRIS demo Pakasir
 *  10. umkm_order_get            — cek status order (by id atau code)
 *
 * Cara register di OpenClaw:
 *
 *   openclaw mcp add umkm-finance \
 *     --path node \
 *     --args "/abs/path/to/liana-mcp/server.mjs" \
 *     --env DASHBOARD_URL=https://your-app.vercel.app \
 *     --env LIANA_SHARED_SECRET=your-secret \
 *     --env BUSINESS_ID=11111111-1111-4111-8111-111111111111 \
 *     --env OPENCLAW_HOOK_TOKEN=your-callback-token
 *
 * Lihat README.md di folder ini untuk panduan lengkap.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// =====================================================================
// Config dari environment
// =====================================================================

const DASHBOARD_URL = (
  process.env.DASHBOARD_URL ?? "http://localhost:3000"
).replace(/\/$/, "");
const LIANA_SHARED_SECRET = process.env.LIANA_SHARED_SECRET ?? "";
const BUSINESS_ID = process.env.BUSINESS_ID ?? "";
// Token untuk callback ke /api/liana/run-callback. Optional — kalau tidak
// diset, tool umkm_notify_dashboard akan return error. Telegram-only flows
// (tanpa dashboard origin) tidak butuh ini.
const OPENCLAW_HOOK_TOKEN = process.env.OPENCLAW_HOOK_TOKEN ?? "";

if (!LIANA_SHARED_SECRET) {
  console.error(
    "[umkm-finance-mcp] FATAL: LIANA_SHARED_SECRET tidak diset. " +
      "Set lewat OpenClaw saat register MCP server.",
  );
  process.exit(1);
}
if (!BUSINESS_ID) {
  console.error(
    "[umkm-finance-mcp] FATAL: BUSINESS_ID tidak diset. " +
      "Ambil dari Settings → Profil bisnis di dashboard.",
  );
  process.exit(1);
}

// =====================================================================
// Helpers
// =====================================================================

function formatRupiah(n) {
  if (typeof n !== "number" || Number.isNaN(n)) return "Rp0";
  return "Rp" + n.toLocaleString("id-ID");
}

/**
 * Random 6-char base36 ID untuk correlate multiple log lines yang
 * belong ke single tool invocation. Cukup untuk personal usage — collision
 * probability hampir nol di throughput rendah.
 */
function mkRid() {
  return Math.random().toString(36).slice(2, 8);
}

async function callApi(method, path, body, ctx) {
  const url = `${DASHBOARD_URL}${path}`;
  const headers = {
    "Content-Type": "application/json",
  };
  // Healthcheck tidak butuh auth
  if (path !== "/api/liana/health") {
    headers["Authorization"] = `Bearer ${LIANA_SHARED_SECRET}`;
  }

  const apiStart = Date.now();
  if (ctx) {
    console.error(
      `[mcp] tool=${ctx.tool} rid=${ctx.rid} api_call=${method} ${path} start`,
    );
  }

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (ctx) {
      console.error(
        `[mcp] tool=${ctx.tool} rid=${ctx.rid} api_call=${method} ${path} duration_ms=${Date.now() - apiStart} status=network_error`,
      );
    }
    return {
      ok: false,
      error: {
        code: "network_error",
        message: `Tidak bisa connect ke dashboard di ${DASHBOARD_URL}: ${err?.message ?? err}`,
      },
    };
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    if (ctx) {
      console.error(
        `[mcp] tool=${ctx.tool} rid=${ctx.rid} api_call=${method} ${path} duration_ms=${Date.now() - apiStart} status=invalid_response http=${response.status}`,
      );
    }
    return {
      ok: false,
      error: {
        code: "invalid_response",
        message: `Server balas non-JSON (HTTP ${response.status}).`,
      },
    };
  }

  if (ctx) {
    console.error(
      `[mcp] tool=${ctx.tool} rid=${ctx.rid} api_call=${method} ${path} duration_ms=${Date.now() - apiStart} status=${payload.ok ? "ok" : "error"} http=${response.status}`,
    );
  }
  return payload;
}

function asText(text) {
  return { content: [{ type: "text", text }] };
}

function asError(message) {
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}

// =====================================================================
// MCP server
// =====================================================================

const server = new McpServer({
  name: "umkm-finance",
  version: "1.0.0",
});

// ---------------------------------------------------------------------
// Tool 1: Catat pemasukan / pengeluaran tunai
// ---------------------------------------------------------------------
server.tool(
  "umkm_catat_pemasukan_pengeluaran",
  "Catat satu transaksi pemasukan ATAU pengeluaran tunai (langsung dibayar). " +
    "JANGAN pakai tool ini untuk piutang baru atau pembayaran piutang — pakai tool yang sesuai. " +
    "Default tanggal = hari ini di TZ Jakarta. Source otomatis 'chat'.",
  {
    type: z
      .enum(["income", "expense"])
      .describe("'income' = pemasukan, 'expense' = pengeluaran"),
    amount: z
      .number()
      .positive()
      .describe(
        "Jumlah dalam rupiah, sudah dikonversi ke angka utuh (contoh: '60rb' → 60000)",
      ),
    category_name: z
      .string()
      .optional()
      .describe(
        "Nama kategori (mis. 'penjualan', 'belanja_bahan'). Server akan lookup. " +
          "Boleh kosong kalau tidak yakin.",
      ),
    note: z
      .string()
      .optional()
      .describe("Catatan singkat dari chat user (≤ 280 karakter)"),
    transaction_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe(
        "Tanggal YYYY-MM-DD. Default hari ini Jakarta. Pakai kalau user sebut 'kemarin' / 'tadi'.",
      ),
  },
  async (args) => {
    const ctx = { tool: "umkm_catat_pemasukan_pengeluaran", rid: mkRid() };
    const start = Date.now();
    console.error(`[mcp] tool=${ctx.tool} rid=${ctx.rid} start`);

    const result = await callApi(
      "POST",
      "/api/liana/finance-input",
      {
        business_id: BUSINESS_ID,
        type: args.type,
        amount: args.amount,
        category_name: args.category_name ?? null,
        note: args.note ?? null,
        transaction_date: args.transaction_date,
        source: "chat",
        created_by: "Liana",
      },
      ctx,
    );

    if (!result.ok) {
      console.error(
        `[mcp] tool=${ctx.tool} rid=${ctx.rid} total_ms=${Date.now() - start} result=error code=${result.error?.code ?? "unknown"}`,
      );
      return asError(
        `${result.error?.code ?? "unknown"}: ${result.error?.message ?? "tidak diketahui"}`,
      );
    }

    const tx = result.data?.transaction;
    const verb = args.type === "income" ? "Pemasukan" : "Pengeluaran";
    console.error(
      `[mcp] tool=${ctx.tool} rid=${ctx.rid} total_ms=${Date.now() - start} result=ok`,
    );
    return asText(
      `${verb} ${formatRupiah(args.amount)} berhasil dicatat (id: ${tx?.id}). ` +
        `Tanggal: ${tx?.transaction_date}. ` +
        `Kategori: ${tx?.category_name ?? "tanpa kategori"}.`,
    );
  },
);

// ---------------------------------------------------------------------
// Tool 2: Catat piutang baru
// ---------------------------------------------------------------------
server.tool(
  "umkm_catat_piutang_baru",
  "Catat piutang baru (pelanggan yang ngutang, BELUM bayar). " +
    "Piutang baru TIDAK menambah pemasukan; baru terhitung sebagai pemasukan saat dibayar via " +
    "tool umkm_catat_pembayaran_piutang. Pakai tool ini saat user bilang 'X ngutang', " +
    "'X belum bayar', 'pesanan partai dengan tempo'.",
  {
    customer_name: z
      .string()
      .min(2)
      .max(120)
      .describe("Nama pelanggan / customer (minimal 2 karakter)"),
    amount: z
      .number()
      .positive()
      .describe("Total piutang dalam rupiah"),
    category_name: z
      .string()
      .optional()
      .describe("Kategori piutang (mis. 'piutang_pelanggan'). Boleh kosong."),
    note: z
      .string()
      .optional()
      .describe("Detail pesanan / catatan"),
    due_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe(
        "Tanggal jatuh tempo YYYY-MM-DD. Convert frase relatif ('minggu depan') ke tanggal absolut.",
      ),
  },
  async (args) => {
    const ctx = { tool: "umkm_catat_piutang_baru", rid: mkRid() };
    const start = Date.now();
    console.error(`[mcp] tool=${ctx.tool} rid=${ctx.rid} start`);

    const result = await callApi(
      "POST",
      "/api/liana/receivable-input",
      {
        business_id: BUSINESS_ID,
        customer_name: args.customer_name,
        amount: args.amount,
        category_name: args.category_name ?? null,
        note: args.note ?? null,
        due_date: args.due_date ?? null,
        source: "chat",
      },
      ctx,
    );

    if (!result.ok) {
      console.error(
        `[mcp] tool=${ctx.tool} rid=${ctx.rid} total_ms=${Date.now() - start} result=error code=${result.error?.code ?? "unknown"}`,
      );
      return asError(
        `${result.error?.code ?? "unknown"}: ${result.error?.message ?? "tidak diketahui"}`,
      );
    }

    const rc = result.data?.receivable;
    const dueText = rc?.due_date
      ? `Jatuh tempo: ${rc.due_date}.`
      : "Tanpa tanggal jatuh tempo.";
    console.error(
      `[mcp] tool=${ctx.tool} rid=${ctx.rid} total_ms=${Date.now() - start} result=ok`,
    );
    return asText(
      `Piutang ${args.customer_name} sebesar ${formatRupiah(args.amount)} dicatat (id: ${rc?.id}). ` +
        `${dueText} Status: belum bayar (unpaid).`,
    );
  },
);

// ---------------------------------------------------------------------
// Tool 3: Catat pembayaran piutang
// ---------------------------------------------------------------------
server.tool(
  "umkm_catat_pembayaran_piutang",
  "Catat pembayaran piutang oleh pelanggan (sebagian atau penuh). " +
    "WAJIB isi salah satu: receivable_id ATAU customer_name. " +
    "Kalau hanya kasih customer_name, server otomatis cari piutang aktif terdekat untuk pelanggan itu. " +
    "Pembayaran ini OTOMATIS jadi pemasukan (type='receivable_payment') secara atomik.",
  {
    customer_name: z
      .string()
      .optional()
      .describe(
        "Nama pelanggan (case-insensitive). Server cari piutang aktif " +
          "dengan due_date paling dekat. Pilih ini kalau user cuma sebut nama.",
      ),
    receivable_id: z
      .string()
      .uuid()
      .optional()
      .describe(
        "UUID piutang langsung. Pilih kalau sebelumnya sudah ambil dari recap " +
          "dan ingin presisi.",
      ),
    amount: z
      .number()
      .positive()
      .describe(
        "Jumlah yang dibayar (rupiah). Tidak boleh > sisa piutang. " +
          "Untuk 'lunas', ambil sisa dari recap dulu.",
      ),
    payment_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("Tanggal pembayaran YYYY-MM-DD. Default hari ini Jakarta."),
    note: z
      .string()
      .optional()
      .describe("Catatan, mis. 'transfer BCA', 'tunai'."),
  },
  async (args) => {
    const ctx = { tool: "umkm_catat_pembayaran_piutang", rid: mkRid() };
    const start = Date.now();
    console.error(`[mcp] tool=${ctx.tool} rid=${ctx.rid} start`);

    if (!args.customer_name && !args.receivable_id) {
      console.error(
        `[mcp] tool=${ctx.tool} rid=${ctx.rid} total_ms=${Date.now() - start} result=error code=missing_target`,
      );
      return asError(
        "Harus mengisi salah satu: customer_name atau receivable_id.",
      );
    }

    const result = await callApi(
      "POST",
      "/api/liana/receivable-payment",
      {
        business_id: BUSINESS_ID,
        customer_name: args.customer_name ?? null,
        receivable_id: args.receivable_id ?? null,
        amount: args.amount,
        payment_date: args.payment_date,
        note: args.note ?? null,
        source: "chat",
        created_by: "Liana",
      },
      ctx,
    );

    if (!result.ok) {
      // Translate code yang penting jadi pesan natural
      const code = result.error?.code;
      const msg = result.error?.message ?? "";
      console.error(
        `[mcp] tool=${ctx.tool} rid=${ctx.rid} total_ms=${Date.now() - start} result=error code=${code ?? "unknown"}`,
      );
      if (code === "amount_exceeds_remaining") {
        return asError(
          `Jumlah pembayaran ${formatRupiah(args.amount)} melebihi sisa piutang. ${msg}`,
        );
      }
      if (code === "receivable_not_found") {
        return asError(
          `Piutang tidak ditemukan untuk ${args.customer_name ?? args.receivable_id}. ${msg}`,
        );
      }
      if (code === "receivable_already_paid") {
        return asError(`Piutang sudah lunas. ${msg}`);
      }
      return asError(`${code ?? "unknown"}: ${msg}`);
    }

    const rc = result.data?.receivable;
    const sisa = rc ? Number(rc.amount) - Number(rc.paid_amount) : null;
    const isPaid = rc?.status === "paid";
    const tail = isPaid
      ? "LUNAS sepenuhnya."
      : sisa !== null
        ? `Sisa: ${formatRupiah(sisa)}.`
        : "";
    console.error(
      `[mcp] tool=${ctx.tool} rid=${ctx.rid} total_ms=${Date.now() - start} result=ok`,
    );
    return asText(
      `Pembayaran ${formatRupiah(args.amount)} dari ${rc?.customer_name ?? "pelanggan"} berhasil dicatat. ${tail}`,
    );
  },
);

// ---------------------------------------------------------------------
// Tool 4: Ambil rekap
// ---------------------------------------------------------------------
server.tool(
  "umkm_ambil_rekap",
  "Ambil ringkasan keuangan untuk periode tertentu (today / week / month). " +
    "Return: total pemasukan, pengeluaran, laba, jumlah transaksi, total piutang aktif, " +
    "list transaksi terbaru, dan list piutang aktif. " +
    "Pakai untuk jawab 'rekap hari ini', 'berapa laba minggu ini', dst.",
  {
    period: z
      .enum(["today", "week", "month"])
      .default("today")
      .describe(
        "today = hari ini, week = 7 hari terakhir, month = bulan ini",
      ),
  },
  async (args) => {
    const ctx = { tool: "umkm_ambil_rekap", rid: mkRid() };
    const start = Date.now();
    console.error(`[mcp] tool=${ctx.tool} rid=${ctx.rid} start`);

    const period = args.period ?? "today";
    const qs = new URLSearchParams({
      business_id: BUSINESS_ID,
      period,
    });
    const result = await callApi(
      "GET",
      `/api/liana/recap?${qs.toString()}`,
      null,
      ctx,
    );

    if (!result.ok) {
      console.error(
        `[mcp] tool=${ctx.tool} rid=${ctx.rid} total_ms=${Date.now() - start} result=error code=${result.error?.code ?? "unknown"}`,
      );
      return asError(
        `${result.error?.code ?? "unknown"}: ${result.error?.message ?? "tidak diketahui"}`,
      );
    }

    const d = result.data;
    const s = d.summary;
    const lines = [];
    lines.push(`Rekap ${d.period.label} (${d.period.from} – ${d.period.to}):`);
    lines.push(`- Pemasukan: ${formatRupiah(s.total_income)}`);
    lines.push(`- Pengeluaran: ${formatRupiah(s.total_expense)}`);
    lines.push(
      `- Laba: ${formatRupiah(s.profit)} (${s.transactions_count} transaksi)`,
    );
    lines.push(
      `- Piutang aktif total: ${formatRupiah(s.active_receivables)}`,
    );

    if (d.recent_transactions?.length > 0) {
      lines.push("");
      lines.push(`${d.recent_transactions.length} transaksi terakhir:`);
      for (const tx of d.recent_transactions.slice(0, 5)) {
        const sign = tx.type === "expense" ? "-" : "+";
        const cat = tx.category_name ? ` [${tx.category_name}]` : "";
        const note = tx.note ? ` "${tx.note}"` : "";
        lines.push(
          `  ${tx.transaction_date} ${sign}${formatRupiah(Number(tx.amount))}${cat}${note}`,
        );
      }
    }

    if (d.active_receivables?.length > 0) {
      lines.push("");
      lines.push(`${d.active_receivables.length} piutang aktif:`);
      for (const rc of d.active_receivables.slice(0, 5)) {
        const sisa = Number(rc.amount) - Number(rc.paid_amount);
        const due = rc.due_date ? ` (jatuh tempo ${rc.due_date})` : "";
        lines.push(
          `  ${rc.customer_name}: ${formatRupiah(sisa)} [${rc.status}]${due}`,
        );
      }
    }

    console.error(
      `[mcp] tool=${ctx.tool} rid=${ctx.rid} total_ms=${Date.now() - start} result=ok`,
    );
    return asText(lines.join("\n"));
  },
);

// ---------------------------------------------------------------------
// Tool 5: Health check
// ---------------------------------------------------------------------
server.tool(
  "umkm_health_check",
  "Cek apakah dashboard server hidup dan dapat dipanggil. " +
    "Tidak butuh auth. Pakai untuk debugging koneksi.",
  {},
  async () => {
    const result = await callApi("GET", "/api/liana/health");
    if (!result.ok) {
      return asError(
        result.error?.message ?? "Server dashboard tidak bisa dijangkau.",
      );
    }
    const d = result.data;
    return asText(
      `OK. Service: ${d.service}, version: ${d.version}, ` +
        `server time: ${d.server_time}. URL: ${DASHBOARD_URL}.`,
    );
  },
);

// ---------------------------------------------------------------------
// Tool 6: Notify dashboard run done
// ---------------------------------------------------------------------
//
// Kontekst: Dashboard chat panel kirim prompt ke Liana via OpenClaw hooks.
// Awalnya OpenClaw hook-callback yang notify dashboard saat reply terkirim,
// tapi fitur itu sempat bermasalah (callback tidak fire setelah upgrade
// gateway 2026.4.25 -> 2026.4.26).
//
// Sebagai gantinya, Liana sendiri yang panggil tool ini SETELAH balas user.
// Tool ini POST ke /api/liana/run-callback dengan bearer token, lalu dashboard
// update row liana_runs (status=done, delivered_at populated, reply_text
// disimpan). Realtime push akan refresh chat panel ke status "done".
//
// Trigger: Liana baca tag [dashboard_run_id=<UUID>] di prompt user.
// Kalau tag ada → panggil tool ini SETELAH jawab user.
// Kalau tag tidak ada → SKIP tool ini (prompt asal Telegram, bukan dashboard).
server.tool(
  "umkm_notify_dashboard",
  "WAJIB dipanggil ketika prompt user mengandung tag [dashboard_run_id=<UUID>] " +
    "(artinya pesan asal dari dashboard, bukan Telegram langsung). Tool ini update " +
    "status pesan di dashboard supaya pill 'thinking' berubah jadi 'done' dan reply " +
    "muncul di chat panel. Panggil SETELAH lo selesai balas user di Telegram. " +
    "JANGAN panggil kalau prompt TIDAK punya tag tersebut.",
  {
    dashboard_run_id: z
      .string()
      .uuid()
      .describe(
        "UUID yang muncul di tag [dashboard_run_id=<UUID>] di awal prompt user. " +
          "Copy persis dari prompt, jangan diubah atau direka-reka.",
      ),
    reply_text: z
      .string()
      .min(1)
      .max(8000)
      .describe(
        "Reply yang lo kirim ke user. Boleh sama persis dengan jawaban Telegram, " +
          "atau ringkasan singkat (≤ 8000 char). Akan ditampilkan di dashboard chat panel.",
      ),
  },
  async (args) => {
    const ctx = { tool: "umkm_notify_dashboard", rid: mkRid() };
    const start = Date.now();
    console.error(
      `[mcp] tool=${ctx.tool} rid=${ctx.rid} start dashboard_run_id=${args.dashboard_run_id}`,
    );

    if (!OPENCLAW_HOOK_TOKEN) {
      console.error(
        `[mcp] tool=${ctx.tool} rid=${ctx.rid} total_ms=${Date.now() - start} result=error code=token_missing`,
      );
      return asError(
        "OPENCLAW_HOOK_TOKEN tidak diset di env MCP server. Tambahkan via " +
          "`openclaw mcp set umkm-finance --env OPENCLAW_HOOK_TOKEN=<token>` " +
          "lalu restart gateway.",
      );
    }

    const url = `${DASHBOARD_URL}/api/liana/run-callback`;
    const apiStart = Date.now();
    console.error(
      `[mcp] tool=${ctx.tool} rid=${ctx.rid} api_call=POST /api/liana/run-callback start`,
    );

    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENCLAW_HOOK_TOKEN}`,
        },
        body: JSON.stringify({
          status: "done",
          replyText: args.reply_text,
          replyFormat: "plain",
          deliveredAt: new Date().toISOString(),
          metadata: {
            dashboardRunId: args.dashboard_run_id,
          },
        }),
      });
    } catch (err) {
      console.error(
        `[mcp] tool=${ctx.tool} rid=${ctx.rid} api_call=POST /api/liana/run-callback duration_ms=${Date.now() - apiStart} status=network_error`,
      );
      console.error(
        `[mcp] tool=${ctx.tool} rid=${ctx.rid} total_ms=${Date.now() - start} result=error code=network_error`,
      );
      return asError(
        `Gagal connect ke dashboard di ${DASHBOARD_URL}: ${err?.message ?? err}`,
      );
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      console.error(
        `[mcp] tool=${ctx.tool} rid=${ctx.rid} api_call=POST /api/liana/run-callback duration_ms=${Date.now() - apiStart} http=${response.status} status=invalid_response`,
      );
      console.error(
        `[mcp] tool=${ctx.tool} rid=${ctx.rid} total_ms=${Date.now() - start} result=error code=invalid_response`,
      );
      return asError(`Server balas non-JSON (HTTP ${response.status}).`);
    }

    console.error(
      `[mcp] tool=${ctx.tool} rid=${ctx.rid} api_call=POST /api/liana/run-callback duration_ms=${Date.now() - apiStart} http=${response.status} status=${payload.ok ? "ok" : "error"}`,
    );

    if (!payload.ok) {
      console.error(
        `[mcp] tool=${ctx.tool} rid=${ctx.rid} total_ms=${Date.now() - start} result=error code=${payload.error?.code ?? "unknown"}`,
      );
      return asError(
        `${payload.error?.code ?? "unknown"}: ${payload.error?.message ?? "tidak diketahui"}`,
      );
    }

    const matched = payload.data?.matched === true;
    console.error(
      `[mcp] tool=${ctx.tool} rid=${ctx.rid} total_ms=${Date.now() - start} result=ok matched=${matched}`,
    );
    return asText(
      matched
        ? "Dashboard ter-update: status=done, reply_text disimpan. Pill di chat panel akan switch ke 'done'."
        : `Notifikasi terkirim, tapi dashboard_run_id ${args.dashboard_run_id} tidak ditemukan di database. Cek apakah UUID di tag sesuai dengan prompt user.`,
    );
  },
);

// =====================================================================
// Phase 4: Order chat tools (catalog → order → QRIS)
// =====================================================================

// ---------------------------------------------------------------------
// Tool 7: Catalog search
// ---------------------------------------------------------------------
server.tool(
  "umkm_catalog_search",
  "Cari produk dari katalog dashboard. WAJIB dipanggil sebelum umkm_create_order " +
    "kalau user sebut produk dengan nama natural (mis. 'matcha cream', 'fries'), " +
    "supaya dapat SKU yang valid. Default hanya tampilkan produk aktif & ready " +
    "stok (only_ready=true). Set query='' untuk list semua aktif (max 200).",
  {
    query: z
      .string()
      .optional()
      .describe(
        "Substring case-insensitive yang dicocokkan dengan name ATAU SKU. " +
          "Kosongkan untuk list semua. Contoh: 'matcha', 'P004'.",
      ),
    category: z
      .string()
      .optional()
      .describe(
        "Filter by kategori exact match (mis. 'Coffee', 'Snack'). Kosongkan kalau tidak yakin.",
      ),
    only_ready: z
      .boolean()
      .optional()
      .default(true)
      .describe(
        "Default true: filter is_active=true + stock_status='ready'. " +
          "Set false kalau owner mau lihat semua termasuk habis/preorder.",
      ),
    limit: z
      .number()
      .int()
      .positive()
      .max(50)
      .optional()
      .default(20)
      .describe("Maksimum hasil (default 20, hard cap 50)."),
  },
  async (args) => {
    const ctx = { tool: "umkm_catalog_search", rid: mkRid() };
    const start = Date.now();
    console.error(`[mcp] tool=${ctx.tool} rid=${ctx.rid} start`);

    const qs = new URLSearchParams();
    if (args.query?.trim()) qs.set("search", args.query.trim());
    if (args.category?.trim()) qs.set("category", args.category.trim());
    if (args.only_ready !== false) {
      qs.set("active", "true");
      qs.set("stock_status", "ready");
    }
    if (args.limit) qs.set("limit", String(args.limit));

    const result = await callApi(
      "GET",
      `/api/products?${qs.toString()}`,
      null,
      ctx,
    );

    if (!result.ok) {
      console.error(
        `[mcp] tool=${ctx.tool} rid=${ctx.rid} total_ms=${Date.now() - start} result=error code=${result.error?.code ?? "unknown"}`,
      );
      return asError(
        `${result.error?.code ?? "unknown"}: ${result.error?.message ?? "tidak diketahui"}`,
      );
    }

    const products = result.data?.products ?? [];
    if (products.length === 0) {
      console.error(
        `[mcp] tool=${ctx.tool} rid=${ctx.rid} total_ms=${Date.now() - start} result=ok count=0`,
      );
      return asText(
        "Tidak ada produk yang cocok. " +
          (args.only_ready
            ? "Coba lepas only_ready (set false) untuk lihat produk yang habis/preorder."
            : "Cek lagi query/kategori atau owner perlu tambah produk dulu di dashboard."),
      );
    }

    const lines = [`${products.length} produk ditemukan:`];
    for (const p of products) {
      const stock = p.stock_status ? ` [${p.stock_status}]` : "";
      const cat = p.category ? ` · ${p.category}` : "";
      const inactive = p.is_active === false ? " (NON-AKTIF)" : "";
      lines.push(
        `  ${p.sku} — ${p.name} — ${formatRupiah(Number(p.price))}${cat}${stock}${inactive}`,
      );
    }

    console.error(
      `[mcp] tool=${ctx.tool} rid=${ctx.rid} total_ms=${Date.now() - start} result=ok count=${products.length}`,
    );
    return asText(lines.join("\n"));
  },
);

// ---------------------------------------------------------------------
// Tool 8: Create order
// ---------------------------------------------------------------------
server.tool(
  "umkm_create_order",
  "Buat order baru di dashboard berdasarkan permintaan customer dari chat. " +
    "WAJIB pakai SKU (bukan nama produk). Resolve nama → SKU dulu via " +
    "umkm_catalog_search kalau user sebut nama natural. Server akan: " +
    "(1) resolve harga dari katalog (TIDAK terima harga dari client), " +
    "(2) reject produk inactive/habis, (3) generate order_code unik. " +
    "Order baru otomatis status='menunggu_pembayaran' & source='chat'. " +
    "Setelah order dibuat, lanjutkan dengan umkm_generate_qris.",
  {
    customer_name: z
      .string()
      .min(1)
      .max(120)
      .describe("Nama pelanggan/customer yang pesan (dari chat)."),
    fulfillment_method: z
      .string()
      .min(1)
      .max(60)
      .describe(
        "Cara ambil/antar. Contoh valid: 'Ambil di tempat', 'Antar (gojek)', " +
          "'Antar (grab)', 'Antar sendiri'. Tanya ke customer kalau tidak tahu.",
      ),
    items: z
      .array(
        z.object({
          sku: z
            .string()
            .min(1)
            .describe("Kode SKU produk (mis. 'P004'). Resolve via umkm_catalog_search dulu."),
          qty: z
            .number()
            .int()
            .positive()
            .describe("Jumlah item, harus integer positif."),
        }),
      )
      .min(1)
      .max(20)
      .describe("List item pesanan, minimal 1 maksimum 20."),
    address: z
      .string()
      .max(255)
      .optional()
      .describe(
        "Alamat antar (kalau fulfillment 'Antar ...'). Kosongkan kalau ambil di tempat.",
      ),
    notes: z
      .string()
      .max(500)
      .optional()
      .describe(
        "Catatan dari customer (mis. 'less sugar', 'pedas level 2'). Boleh kosong.",
      ),
  },
  async (args) => {
    const ctx = { tool: "umkm_create_order", rid: mkRid() };
    const start = Date.now();
    console.error(
      `[mcp] tool=${ctx.tool} rid=${ctx.rid} start customer=${args.customer_name} items=${args.items.length}`,
    );

    const body = {
      customer_name: args.customer_name,
      fulfillment_method: args.fulfillment_method,
      address: args.address ?? null,
      notes: args.notes ?? null,
      items: args.items,
      // server-side default: created_from_source='chat', created_by='Liana'
      // (di-set otomatis di /api/orders bearer mode).
    };

    const result = await callApi("POST", "/api/orders", body, ctx);

    if (!result.ok) {
      const code = result.error?.code ?? "unknown";
      const msg = result.error?.message ?? "tidak diketahui";
      console.error(
        `[mcp] tool=${ctx.tool} rid=${ctx.rid} total_ms=${Date.now() - start} result=error code=${code}`,
      );
      // Translate code yang penting jadi pesan natural untuk Liana.
      if (code === "validation_failed") {
        const fieldMsgs = result.error?.fieldErrors
          ? Object.entries(result.error.fieldErrors)
              .map(([k, v]) => `${k}: ${v}`)
              .join("; ")
          : msg;
        return asError(`Validasi gagal: ${fieldMsgs}`);
      }
      if (code === "product_not_found") {
        return asError(
          `Produk tidak ditemukan: ${msg}. ` +
            `Cek SKU dengan umkm_catalog_search dulu.`,
        );
      }
      if (code === "product_inactive") {
        return asError(`Produk sedang non-aktif: ${msg}`);
      }
      if (code === "product_out_of_stock") {
        return asError(`Produk habis stok: ${msg}`);
      }
      return asError(`${code}: ${msg}`);
    }

    const order = result.data?.order;
    const items = result.data?.items ?? [];
    const detailUrl = order?.id
      ? `${DASHBOARD_URL}/orders/${order.id}`
      : null;

    const lines = [];
    lines.push(`Pesanan dibuat ✅`);
    lines.push(`Order: ${order?.order_code}`);
    for (const it of items) {
      lines.push(
        `• ${it.qty}× ${it.product_name} — ${formatRupiah(Number(it.subtotal))}`,
      );
    }
    lines.push(`Total normal: ${formatRupiah(Number(order?.order_total_amount))}`);
    if (detailUrl) lines.push(`Detail: ${detailUrl}`);
    lines.push(`Status: menunggu pembayaran`);
    lines.push(``);
    lines.push(
      `Lanjut: panggil umkm_generate_qris dengan order_id=${order?.id} ` +
        `untuk dapat QRIS demo Pakasir.`,
    );

    console.error(
      `[mcp] tool=${ctx.tool} rid=${ctx.rid} total_ms=${Date.now() - start} result=ok order_code=${order?.order_code}`,
    );
    return asText(lines.join("\n"));
  },
);

// ---------------------------------------------------------------------
// Tool 9: Generate QRIS
// ---------------------------------------------------------------------
server.tool(
  "umkm_generate_qris",
  "Generate QRIS demo Pakasir untuk order yang sudah ada. WAJIB dipanggil " +
    "setelah umkm_create_order. Bisa pakai order_id (UUID) ATAU order_code " +
    "(mis. 'ORD-20260429-001'). Server akan return: gambar QR sebagai MCP " +
    "image content (PNG base64) yang BISA langsung di-attach ke chat " +
    "Telegram pakai sendPhoto, plus payment_number (EMVCo string) sebagai " +
    "fallback / alt renderer, plus metadata (amount Rp600 demo, total " +
    "payable, fee, expired_at). PENTING: JANGAN kirim admin_detail_url ke " +
    "customer — itu halaman admin internal yang butuh login. Kirim QR " +
    "image langsung di chat sebagai foto.",
  {
    order_id: z
      .string()
      .optional()
      .describe(
        "UUID order. Ambil dari output umkm_create_order. Pilih ini untuk presisi.",
      ),
    order_code: z
      .string()
      .optional()
      .describe(
        "Order code (mis. 'ORD-20260429-001'). Server akan resolve ke UUID. " +
          "Pilih kalau hanya tahu code, mis. user reply 'sudah bayar order ORD-...'.",
      ),
  },
  async (args) => {
    const ctx = { tool: "umkm_generate_qris", rid: mkRid() };
    const start = Date.now();
    console.error(`[mcp] tool=${ctx.tool} rid=${ctx.rid} start`);

    if (!args.order_id && !args.order_code) {
      console.error(
        `[mcp] tool=${ctx.tool} rid=${ctx.rid} total_ms=${Date.now() - start} result=error code=missing_target`,
      );
      return asError("Wajib isi salah satu: order_id atau order_code.");
    }

    // Resolve order_code → order_id kalau perlu.
    let orderId = args.order_id?.trim();
    let orderCode = args.order_code?.trim();

    if (!orderId && orderCode) {
      const lookup = await callApi(
        "GET",
        `/api/orders?search=${encodeURIComponent(orderCode)}&limit=5`,
        null,
        ctx,
      );
      if (!lookup.ok) {
        console.error(
          `[mcp] tool=${ctx.tool} rid=${ctx.rid} total_ms=${Date.now() - start} result=error code=lookup_failed`,
        );
        return asError(
          `Gagal cari order dengan code ${orderCode}: ${lookup.error?.message ?? ""}`,
        );
      }
      const matches = (lookup.data?.orders ?? []).filter(
        (o) => o.order_code === orderCode,
      );
      if (matches.length === 0) {
        console.error(
          `[mcp] tool=${ctx.tool} rid=${ctx.rid} total_ms=${Date.now() - start} result=error code=order_not_found`,
        );
        return asError(`Order dengan code ${orderCode} tidak ditemukan.`);
      }
      orderId = matches[0].id;
    }

    const result = await callApi(
      "POST",
      `/api/orders/${orderId}/payment/pakasir/create`,
      {},
      ctx,
    );

    if (!result.ok) {
      const code = result.error?.code ?? "unknown";
      const msg = result.error?.message ?? "tidak diketahui";
      console.error(
        `[mcp] tool=${ctx.tool} rid=${ctx.rid} total_ms=${Date.now() - start} result=error code=${code}`,
      );
      if (code === "order_already_paid") {
        return asError(
          `Order ini sudah lunas, tidak perlu QRIS lagi.`,
        );
      }
      if (code === "order_cancelled") {
        return asError(`Order ini sudah dibatalkan, tidak bisa generate QRIS.`);
      }
      if (code === "config_error") {
        return asError(
          "Pakasir belum dikonfigurasi di server (PAKASIR_API_KEY/PROJECT_ID kosong). " +
            "Hubungi owner untuk set env.",
        );
      }
      if (code === "pakasir_error") {
        return asError(`Pakasir reject: ${msg}`);
      }
      return asError(`${code}: ${msg}`);
    }

    const display = result.data?.display ?? {};
    const adminDetailUrl = `${DASHBOARD_URL}/orders/${orderId}`;

    // 1) Header text untuk customer (kirim isi ini di Telegram).
    const customerLines = [];
    customerLines.push(`QRIS demo Pakasir siap ✅`);
    if (orderCode) customerLines.push(`Order: ${orderCode}`);
    customerLines.push(
      `Nominal QRIS demo: ${formatRupiah(Number(display.amount ?? 0))}`,
    );
    if (
      display.totalPayment != null &&
      Number(display.totalPayment) > Number(display.amount ?? 0)
    ) {
      customerLines.push(
        `Total payable Pakasir: ${formatRupiah(Number(display.totalPayment))} ` +
          `(${formatRupiah(Number(display.amount))} + fee ${formatRupiah(Number(display.fee ?? 0))})`,
      );
    }
    if (display.expiredAt) {
      customerLines.push(`Berlaku sampai: ${display.expiredAt}`);
    }
    customerLines.push(`Status: menunggu pembayaran`);
    customerLines.push(
      `Instruksi: QRIS siap dikirim sebagai gambar di chat. Scan dari ` +
        `aplikasi e-wallet / m-banking apapun.`,
    );

    const content = [{ type: "text", text: customerLines.join("\n") }];

    // 2) Image content kalau qrDataUrl tersedia. Strip prefix data URL
    //    supaya jadi pure base64 (sesuai MCP ImageContent spec).
    const dataUrl =
      typeof display.qrDataUrl === "string" ? display.qrDataUrl : "";
    const dataUrlMatch = dataUrl.match(/^data:image\/(png|jpeg);base64,(.+)$/);
    let hasImage = false;
    if (dataUrlMatch) {
      hasImage = true;
      const mimeType = `image/${dataUrlMatch[1]}`;
      const b64 = dataUrlMatch[2];
      content.push({ type: "image", data: b64, mimeType });
    }

    // 3) Fallback / alt renderer info: payment_number (EMV) selalu
    //    disertakan kalau ada, supaya client yang gak bisa render image
    //    content masih bisa generate QR sendiri atau kirim sebagai text.
    const metaLines = [];
    if (!hasImage) {
      if (display.emv) {
        metaLines.push(
          `⚠️ Gambar QR tidak ter-render di server. Render QR sendiri dari ` +
            `payment_number di bawah, atau hubungi owner.`,
        );
      } else {
        metaLines.push(
          `⚠️ QR data tidak tersedia (Pakasir tidak return EMV maupun data ` +
            `URL). Hubungi owner untuk cek konfigurasi Pakasir.`,
        );
      }
    }
    if (display.emv) {
      metaLines.push(`payment_number (EMVCo): ${display.emv}`);
    }
    if (display.pakasirReference) {
      metaLines.push(`pakasir_reference: ${display.pakasirReference}`);
    }
    metaLines.push(
      `admin_detail_url: ${adminDetailUrl} (admin only — JANGAN kirim ke customer, butuh login)`,
    );
    content.push({ type: "text", text: metaLines.join("\n") });

    console.error(
      `[mcp] tool=${ctx.tool} rid=${ctx.rid} total_ms=${Date.now() - start} ` +
        `result=ok has_image=${hasImage} emv_len=${display.emv?.length ?? 0}`,
    );
    return { content };
  },
);

// ---------------------------------------------------------------------
// Tool 10: Order get (status check)
// ---------------------------------------------------------------------
server.tool(
  "umkm_order_get",
  "Ambil detail + status 1 order. Pakai untuk jawab pertanyaan customer " +
    "'order saya udah dibayar?' atau owner 'cek order ORD-XXX'. Bisa pakai " +
    "order_id (UUID) atau order_code (string).",
  {
    order_id: z
      .string()
      .optional()
      .describe("UUID order. Pilih untuk presisi."),
    order_code: z
      .string()
      .optional()
      .describe("Order code (mis. 'ORD-20260429-001'). Server resolve ke UUID."),
  },
  async (args) => {
    const ctx = { tool: "umkm_order_get", rid: mkRid() };
    const start = Date.now();
    console.error(`[mcp] tool=${ctx.tool} rid=${ctx.rid} start`);

    if (!args.order_id && !args.order_code) {
      return asError("Wajib isi salah satu: order_id atau order_code.");
    }

    let orderId = args.order_id?.trim();
    const orderCode = args.order_code?.trim();
    if (!orderId && orderCode) {
      const lookup = await callApi(
        "GET",
        `/api/orders?search=${encodeURIComponent(orderCode)}&limit=5`,
        null,
        ctx,
      );
      if (!lookup.ok) {
        return asError(`Gagal cari order: ${lookup.error?.message ?? ""}`);
      }
      const matches = (lookup.data?.orders ?? []).filter(
        (o) => o.order_code === orderCode,
      );
      if (matches.length === 0) {
        return asError(`Order ${orderCode} tidak ditemukan.`);
      }
      orderId = matches[0].id;
    }

    const result = await callApi("GET", `/api/orders/${orderId}`, null, ctx);
    if (!result.ok) {
      const code = result.error?.code ?? "unknown";
      console.error(
        `[mcp] tool=${ctx.tool} rid=${ctx.rid} total_ms=${Date.now() - start} result=error code=${code}`,
      );
      return asError(`${code}: ${result.error?.message ?? ""}`);
    }

    const order = result.data?.order;
    const items = result.data?.items ?? [];
    const detailUrl = `${DASHBOARD_URL}/orders/${orderId}`;

    const lines = [];
    lines.push(`Order ${order?.order_code} (${order?.customer_name})`);
    lines.push(`Status: ${order?.order_status}`);
    lines.push(`Pembayaran: ${order?.payment_status}`);
    lines.push(`Total: ${formatRupiah(Number(order?.order_total_amount))}`);
    if (items.length > 0) {
      lines.push(`Items:`);
      for (const it of items) {
        lines.push(
          `  ${it.qty}× ${it.product_name} — ${formatRupiah(Number(it.subtotal))}`,
        );
      }
    }
    if (order?.fulfillment_method) {
      lines.push(`Fulfillment: ${order.fulfillment_method}`);
    }
    if (order?.notes) lines.push(`Notes: ${order.notes}`);
    lines.push(`Detail: ${detailUrl}`);

    console.error(
      `[mcp] tool=${ctx.tool} rid=${ctx.rid} total_ms=${Date.now() - start} result=ok`,
    );
    return asText(lines.join("\n"));
  },
);

// =====================================================================
// Connect via stdio (standar untuk OpenClaw / Claude Desktop)
// =====================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // OpenClaw akan kirim request via stdin dan baca response dari stdout.
  // Tidak boleh menulis ke stdout selain protocol — gunakan console.error
  // untuk semua log.
  console.error(
    `[umkm-finance-mcp] ready. dashboard=${DASHBOARD_URL} business_id=${BUSINESS_ID}`,
  );
}

main().catch((err) => {
  console.error("[umkm-finance-mcp] fatal:", err);
  process.exit(1);
});

// Graceful shutdown
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
