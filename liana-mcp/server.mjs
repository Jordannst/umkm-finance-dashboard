#!/usr/bin/env node
/**
 * MCP Server untuk Dashboard Keuangan UMKM.
 *
 * Dipakai oleh OpenClaw (Liana) untuk menambah 5 skill keuangan UMKM:
 *  1. umkm_catat_pemasukan_pengeluaran
 *  2. umkm_catat_piutang_baru
 *  3. umkm_catat_pembayaran_piutang
 *  4. umkm_ambil_rekap
 *  5. umkm_health_check
 *
 * Cara register di OpenClaw:
 *
 *   openclaw mcp add umkm-finance \
 *     --path node \
 *     --args "/abs/path/to/liana-mcp/server.mjs" \
 *     --env DASHBOARD_URL=https://your-app.vercel.app \
 *     --env LIANA_SHARED_SECRET=your-secret \
 *     --env BUSINESS_ID=11111111-1111-4111-8111-111111111111
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
