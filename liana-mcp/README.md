# umkm-finance-mcp

MCP (Model Context Protocol) server untuk integrasi **OpenClaw / Liana** dengan **Dashboard Keuangan UMKM**.

Memberikan **10 tools** ke agent Liana:

### Finance (Phase 1)

| Tool | Fungsi |
|---|---|
| `umkm_catat_pemasukan_pengeluaran` | Catat transaksi income / expense |
| `umkm_catat_piutang_baru` | Catat piutang pelanggan baru |
| `umkm_catat_pembayaran_piutang` | Catat pembayaran piutang (atomik via SQL function) |
| `umkm_ambil_rekap` | Ringkasan untuk periode today / week / month |
| `umkm_health_check` | Test koneksi dashboard |
| `umkm_notify_dashboard` | Callback ke dashboard saat reply terkirim |

### Order chat (Phase 4)

| Tool | Fungsi |
|---|---|
| `umkm_catalog_search` | Cari produk (name/SKU/kategori), default hanya yang aktif & ready |
| `umkm_create_order` | Buat order dari chat customer (server resolve harga) |
| `umkm_generate_qris` | Generate QRIS demo Pakasir untuk order |
| `umkm_order_get` | Cek status & detail 1 order |

### Contoh flow `/pesan`

```
User Telegram:
  /pesan Patricia 1 Matcha Cream, 2 French Fries, ambil di tempat, less sugar

Liana:
  1. umkm_catalog_search query="matcha cream"  → SKU=P004, Rp22.000
  2. umkm_catalog_search query="french fries"  → SKU=P010, Rp16.000
  3. umkm_create_order(customer_name="Patricia",
       fulfillment_method="Ambil di tempat",
       items=[{sku:"P004",qty:1},{sku:"P010",qty:2}],
       notes="less sugar")
     → ORD-20260429-002, total Rp54.000
  4. umkm_generate_qris(order_id="...")
     → Rp600 demo, total payable Rp1.603 (incl fee)

Liana balas chat:
  Pesanan dibuat ✅
  Order: ORD-20260429-002
  • 1× SOREA Matcha Cream — Rp22.000
  • 2× French Fries — Rp32.000
  Total normal: Rp54.000
  QRIS demo Pakasir: Rp600 (total payable Rp1.603)
  Scan QR / detail: https://your-app.vercel.app/orders/<uuid>
  Status: menunggu pembayaran
```

## Persyaratan

- **Node.js >= 20**
- **OpenClaw** terinstall (`npm install -g openclaw@latest`)
- **Dashboard Keuangan UMKM** sudah deploy & jalan (lihat `../README.md`)
- **`LIANA_SHARED_SECRET`** dan **`BUSINESS_ID`** dari dashboard

## Setup (3 langkah)

### 1. Install dependencies

Dari folder `liana-mcp/`:

```bash
npm install
```

### 2. Daftarkan ke OpenClaw

Pakai path absolute ke `server.mjs`:

```bash
# Windows (PowerShell)
$ABS_PATH = "$PWD\server.mjs"

# macOS / Linux
ABS_PATH="$PWD/server.mjs"

# Daftar (semua OS)
openclaw mcp add umkm-finance \
  --path node \
  --args "$ABS_PATH" \
  --env DASHBOARD_URL=https://your-app.vercel.app \
  --env LIANA_SHARED_SECRET=your-secret-min-32-char \
  --env BUSINESS_ID=11111111-1111-4111-8111-111111111111
```

> **Penting**: gunakan **path absolute** ke `server.mjs`. Path relatif akan gagal saat OpenClaw spawn process dari working directory yang berbeda.

### 3. Verifikasi

```bash
openclaw mcp list
```

Harus muncul `umkm-finance` dengan 10 tools (lihat tabel di atas).

Test koneksi:

```bash
openclaw mcp logs umkm-finance --last 20
```

Kalau ada baris `[umkm-finance-mcp] ready. dashboard=...` artinya server sudah jalan.

## Test dari Liana

Buka chat OpenClaw dan coba:

```
Test koneksi dashboard keuangan
```

Liana akan panggil `umkm_health_check` dan balas dengan service info.

Kemudian:

```
Tadi jualan kopi susu 4 cup, dapet 60ribu
```

Liana otomatis parse → call `umkm_catat_pemasukan_pengeluaran` dengan `type=income, amount=60000, note='jual kopi susu 4 cup'`.

## Troubleshooting

### `unauthorized` (401)

`LIANA_SHARED_SECRET` di MCP server **tidak sama** dengan yang di-set di Vercel env. Cek keduanya, harus identik karakter per karakter.

### `network_error`

`DASHBOARD_URL` salah, atau dashboard belum deploy / dev server mati. Test manual dengan curl:

```bash
curl https://your-app.vercel.app/api/liana/health
```

### `business_not_found` (404)

`BUSINESS_ID` UUID tidak cocok dengan row di tabel `businesses` di Supabase. Buka dashboard → Settings → Profil bisnis untuk lihat UUID yang benar.

### `server_misconfigured` (503) — Phase 4 only

Tool `umkm_catalog_search`, `umkm_create_order`, `umkm_generate_qris`, atau `umkm_order_get` return `server_misconfigured`:

- **Dashboard side** belum set `LIANA_BUSINESS_ID` env. Tambahkan di Vercel:

  ```
  LIANA_BUSINESS_ID=11111111-1111-4111-8111-111111111111
  ```

  (Sama UUID dengan `BUSINESS_ID` di MCP env. Dashboard butuh ini untuk scope dual-auth.)

  Trigger Vercel redeploy setelah env diubah, lalu retry.

### `unauthorized` di Phase 4 endpoints

`/api/orders` atau `/api/products` return `unauthorized` walaupun secret benar:

- Cek `LIANA_SHARED_SECRET` di Vercel === di MCP env, **char-by-char**.
- Pastikan tidak ada whitespace/newline trailing.

### MCP server tidak start

Cek log:

```bash
openclaw mcp logs umkm-finance --last 50
```

Common issues:
- `MODULE_NOT_FOUND` → lupa `npm install` di folder `liana-mcp/`
- Path absolute salah → ulang `openclaw mcp remove umkm-finance` dan add lagi
- Node version < 20 → upgrade Node

## Update tool (kalau API dashboard berubah)

1. Pull repo terbaru: `git pull` di root project
2. `cd liana-mcp && npm install` (kalau ada deps baru)
3. Restart OpenClaw daemon: `openclaw service restart`

Tools auto-discovered ulang oleh OpenClaw setelah restart.

## Skill ini melakukan

- Auto-attach `Authorization: Bearer <secret>` di setiap request
- Auto-fill `business_id`, `source: 'chat'`, `created_by: 'Liana'`
- Format response sebagai natural Indonesian text yang Liana bisa langsung kutip
- Translate error code (`amount_exceeds_remaining`, `receivable_not_found`, dst) jadi pesan jelas

## Skill ini TIDAK melakukan

- Edit / hapus transaksi yang sudah tercatat (owner pakai dashboard untuk itu)
- Resolve nominal ambigu (Liana sendiri yang harus tanya owner)
- Cache / batch — setiap tool call langsung hit API

## License

MIT — sama dengan project parent.
