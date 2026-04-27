# umkm-finance-mcp

MCP (Model Context Protocol) server untuk integrasi **OpenClaw / Liana** dengan **Dashboard Keuangan UMKM**.

Memberikan 5 tools ke agent Liana:

| Tool | Fungsi |
|---|---|
| `umkm_catat_pemasukan_pengeluaran` | Catat transaksi income / expense |
| `umkm_catat_piutang_baru` | Catat piutang pelanggan baru |
| `umkm_catat_pembayaran_piutang` | Catat pembayaran piutang (atomik via SQL function) |
| `umkm_ambil_rekap` | Ringkasan untuk periode today / week / month |
| `umkm_health_check` | Test koneksi dashboard |

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
  --env BUSINESS_ID=00000000-0000-0000-0000-000000000001
```

> **Penting**: gunakan **path absolute** ke `server.mjs`. Path relatif akan gagal saat OpenClaw spawn process dari working directory yang berbeda.

### 3. Verifikasi

```bash
openclaw mcp list
```

Harus muncul `umkm-finance` dengan 5 tools (`umkm_catat_pemasukan_pengeluaran`, dst).

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
