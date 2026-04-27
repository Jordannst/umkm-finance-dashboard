# Dashboard Keuangan UMKM

Dashboard keuangan UMKM yang terintegrasi dengan agent **Liana**. Fokusnya bukan akuntansi penuh, tapi tracker harian yang owner-friendly: pemasukan, pengeluaran, dan piutang.

- **Chat (Liana)** = layer input cepat & tanya rekap
- **Dashboard (web ini)** = layer review, edit, kelola, visualisasi
- **Aturan kunci**: piutang **TIDAK** masuk pemasukan sampai dibayar

Lihat planning lengkap di:

- `docs/keuangan-dashboard-nextjs-supabase-plan.md`
- `docs/keuangan-dashboard-sprint-plan.md`

## Stack

- **Next.js 16** (App Router, Turbopack default)
- **TypeScript** + **Tailwind CSS v4**
- **shadcn/ui style** (Radix + CVA + lucide-react)
- **Supabase** (auth, postgres, RLS) via `@supabase/ssr`
- **Recharts** untuk grafik
- **Zod** untuk validasi
- **date-fns** + locale `id` untuk format tanggal
- **Sonner** untuk toast notifications

## Persyaratan

- **Node.js >= 20.9** (Next 16 minimum)
- **npm** (project pakai `package-lock.json`)
- Supabase project (cloud) untuk database + auth

## Setup Lokal

1. **Clone & install:**

   ```bash
   git clone <repo-url>
   cd umkm-dashboard
   npm install
   ```

2. **Konfigurasi environment:**

   ```bash
   cp .env.example .env.local
   ```

   Lalu isi nilai sebenarnya di `.env.local`. Lihat detail di [Environment Variables](#environment-variables) di bawah.

3. **Jalankan migration & seed Supabase:**

   Buka Supabase dashboard → **SQL Editor** → **New query**, lalu jalankan secara berurutan:

   1. Isi `supabase/migrations/0001_init_schema.sql` (extensions + 6 tabel + indexes + trigger updated_at)
   2. Isi `supabase/migrations/0002_init_rls.sql` (helper `current_business_id()`, trigger `handle_new_user`, RLS policies)
   3. Isi `supabase/migrations/0003_receivable_functions.sql` (fungsi `pay_receivable()` atomik untuk pembayaran piutang)
   4. Isi `supabase/seed.sql` (business demo + 13 default categories)

   Migrations idempotent (boleh dijalankan berulang). Verifikasi cepat:

   ```sql
   select count(*) from public.businesses;  -- harus 1
   select count(*) from public.categories;  -- harus 13
   ```

   > **Penting**: pastikan UUID `NEXT_PUBLIC_DEMO_BUSINESS_ID` di `.env.local` sama dengan UUID di `supabase/seed.sql` (default: `00000000-0000-0000-0000-000000000001`). Kalau sudah pernah seed dengan UUID lain, sesuaikan salah satunya.

4. **Atur Supabase Auth:**

   Di **Supabase dashboard → Authentication → Providers → Email**:

   - Pastikan **Email** provider aktif
   - Untuk dev cepat: matikan **"Confirm email"** supaya signup langsung login
   - Untuk produksi: nyalakan **"Confirm email"** dan set Redirect URL ke `${NEXT_PUBLIC_APP_URL}/auth/callback`

5. **Jalankan dev server:**

   ```bash
   npm run dev
   ```

   Buka [http://localhost:3000](http://localhost:3000). Akan diarahkan ke `/login` (karena belum ada session).

6. **Signup pertama:**

   - Klik **Daftar** dari halaman login
   - Isi nama, email, password (≥ 8 karakter)
   - Trigger `handle_new_user()` otomatis membuat row di `public.profiles` dengan `business_id` = business demo, role `owner`
   - Setelah signup sukses, user diarahkan ke `/dashboard`

   Owner berikutnya yang signup juga otomatis terhubung ke business demo (untuk MVP single-tenant). Logic invite/multi-business akan ditambah di Sprint 7.

## Environment Variables

| Variable                        | Lokasi    | Wajib | Keterangan                                                                                              |
| ------------------------------- | --------- | ----- | ------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | client    | ✅    | URL project Supabase                                                                                    |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client    | ✅    | Anon key Supabase. RLS berlaku.                                                                         |
| `SUPABASE_SERVICE_ROLE_KEY`     | server    | ✅    | **Server-only**. Bypass RLS. Hanya untuk endpoint Liana yang sudah diverifikasi shared secret + script. |
| `LIANA_SHARED_SECRET`           | server    | ✅    | String acak panjang. Endpoint `/api/liana/*` akan menolak request tanpa header secret yang valid.       |
| `NEXT_PUBLIC_DEMO_BUSINESS_ID`  | client    | ✅    | UUID business demo dari tabel `businesses` (untuk MVP single-tenant).                                   |
| `NEXT_PUBLIC_APP_URL`           | client    | ➖    | Base URL app, dipakai untuk redirect Auth.                                                              |

> **Catatan keamanan**: jangan pernah memberi prefix `NEXT_PUBLIC_` pada `SUPABASE_SERVICE_ROLE_KEY` atau `LIANA_SHARED_SECRET`. Variable dengan prefix tersebut akan dikirim ke browser.

## Scripts

| Script         | Aksi                                  |
| -------------- | ------------------------------------- |
| `npm run dev`   | Dev server (Turbopack, port 3000)     |
| `npm run build` | Production build                      |
| `npm run start` | Jalankan hasil build                  |
| `npm run lint`  | ESLint flat config                    |

## Struktur Folder

```text
app/
  (app)/                 # Layout group: semua halaman butuh auth
    dashboard/page.tsx   # Sprint 2
    transactions/page.tsx# Sprint 3
    receivables/page.tsx # Sprint 4
    reports/page.tsx     # Sprint 5
    settings/page.tsx    # Sprint 7
    layout.tsx           # AppShell wrapper, fetch profile dari Supabase
  (auth)/                # Layout group: halaman publik untuk login/signup
    login/page.tsx
    signup/page.tsx
    layout.tsx           # Layout centered untuk halaman auth
  auth/
    callback/route.ts    # Tukar code → session (dipanggil Supabase)
  api/                   # (mulai Sprint 3/6) Route handlers
  layout.tsx             # Root layout (html, fonts, Toaster)
  page.tsx               # redirect → /dashboard (lalu proxy redirect ke /login bila perlu)
  globals.css            # Tailwind v4 + design tokens
proxy.ts                 # Next.js 16 proxy (eks-middleware): refresh session, protect routes
components/
  ui/                    # shadcn-style primitives (button, card, ...)
  layout/                # AppShell, sidebar nav config
  auth/                  # LoginForm, SignupForm (Client Components)
  shared/                # PageHeader, EmptyState, SprintPending
lib/
  supabase/
    client.ts            # Browser client (anon)
    server.ts            # Server Component / Route Handler client
    admin.ts             # Service role (server-only, bypass RLS)
    middleware.ts        # Helper updateSession() untuk proxy.ts
  auth/
    actions.ts           # Server Actions: signInAction, signUpAction, signOutAction
  finance/
    business.ts          # getCurrentProfile, getCurrentBusiness, getCurrentBusinessId
    format.ts            # formatRupiah, formatDate, parseRupiahInput
  utils.ts               # cn() class merger
types/
  finance.ts             # Tipe domain: Transaction, Receivable, ...
supabase/
  migrations/
    0001_init_schema.sql        # 6 tabel + indexes + trigger updated_at
    0002_init_rls.sql           # current_business_id(), handle_new_user, RLS policies
    0003_receivable_functions.sql # pay_receivable() atomik (Sprint 4)
  seed.sql                       # Demo business + 13 default categories
docs/
  _nextjs-ref/           # Salinan docs Next.js 16 untuk referensi cepat
  keuangan-dashboard-nextjs-supabase-plan.md
  keuangan-dashboard-sprint-plan.md
```

## Roadmap Sprint

Lihat detail di `docs/keuangan-dashboard-sprint-plan.md`.

| Sprint | Fokus                                                       | Status      |
| ------ | ----------------------------------------------------------- | ----------- |
| 0      | Setup repo, deps, folder, env, app shell                    | ✅ Selesai  |
| 1      | Schema + RLS + seed + auth lengkap (login/signup + proxy)   | ✅ Selesai  |
| 2      | `/dashboard` overview (cards + chart 7 hari + lists)        | ✅ Selesai  |
| 3      | `/transactions` CRUD (filter, form, edit, soft delete)      | ✅ Selesai  |
| 4      | `/receivables` (piutang + payment via SQL function atomik)  | ✅ Selesai  |
| 5      | `/reports` (periode + chart + breakdown + export CSV)       | ✅ Selesai  |
| 6      | API `/api/liana/*` (5 endpoint + shared secret auth)        | ✅ Selesai  |
| 7      | `/settings` (profile, bisnis, kategori) + error/404 boundary | ✅ Selesai  |
| 8      | Deploy guide + smoke test + production hardening            | ✅ Selesai  |

## API Integrasi Liana

Liana memanggil endpoint REST untuk catat transaksi/piutang dan ambil rekap. Semua endpoint di bawah `/api/liana/*` (selain `/health`) wajib pakai header:

```http
Authorization: Bearer <LIANA_SHARED_SECRET>
Content-Type: application/json
```

Format response konsisten:

```json
{ "ok": true,  "data": { ... } }
{ "ok": false, "error": { "code": "validation_failed", "message": "...", "fieldErrors": { "amount": "..." } } }
```

### `GET /api/liana/health`

Healthcheck publik (tanpa auth). Cek endpoint hidup.

```bash
curl https://YOUR-APP.example.com/api/liana/health
```

### `POST /api/liana/finance-input`

Catat pemasukan/pengeluaran dari hasil parse chat.

```bash
curl -X POST https://YOUR-APP.example.com/api/liana/finance-input \
  -H "Authorization: Bearer $LIANA_SHARED_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "business_id": "00000000-0000-0000-0000-000000000001",
    "type": "income",
    "amount": 120000,
    "category_name": "penjualan",
    "note": "jual kopi susu 4 cup",
    "transaction_date": "2026-04-27",
    "source": "chat",
    "created_by": "Liana"
  }'
```

- `type`: `"income"` atau `"expense"` (untuk pelunasan piutang pakai endpoint `receivable-payment`).
- `category_name`: opsional. Server lookup by slug → name. Kalau tidak ketemu, transaksi tetap tersimpan tanpa `category_id` tapi `category_name` raw disimpan.
- `transaction_date`: opsional, default hari ini di TZ Jakarta.
- `source`: opsional, default `"chat"`.

### `POST /api/liana/receivable-input`

Catat piutang baru. **Tidak menambah pemasukan** sampai dibayar.

```bash
curl -X POST https://YOUR-APP.example.com/api/liana/receivable-input \
  -H "Authorization: Bearer $LIANA_SHARED_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "business_id": "00000000-0000-0000-0000-000000000001",
    "customer_name": "Budi Santoso",
    "amount": 200000,
    "category_name": "piutang_pelanggan",
    "note": "pesanan kantor 4 dus kopi",
    "due_date": "2026-05-04"
  }'
```

### `POST /api/liana/receivable-payment`

Catat pembayaran piutang (sebagian/penuh). Atomik via SQL function `pay_receivable()`. Kirim **salah satu**: `receivable_id` (UUID langsung) atau `customer_name` (server cari piutang aktif terdekat).

```bash
curl -X POST https://YOUR-APP.example.com/api/liana/receivable-payment \
  -H "Authorization: Bearer $LIANA_SHARED_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "business_id": "00000000-0000-0000-0000-000000000001",
    "customer_name": "Budi",
    "amount": 100000,
    "payment_date": "2026-04-27",
    "note": "transfer BCA"
  }'
```

Error code yang bisa muncul: `receivable_not_found` (404), `receivable_already_paid` (409), `amount_exceeds_remaining` (400), `receivable_business_mismatch` (403).

### `GET /api/liana/recap?business_id=...&period=today|week|month`

Ringkasan untuk Liana balas pertanyaan user "rekap hari ini" / "minggu ini".

```bash
curl "https://YOUR-APP.example.com/api/liana/recap?business_id=00000000-0000-0000-0000-000000000001&period=today" \
  -H "Authorization: Bearer $LIANA_SHARED_SECRET"
```

Response:

```json
{
  "ok": true,
  "data": {
    "period": { "preset": "today", "from": "2026-04-27", "to": "2026-04-27", "label": "Hari ini" },
    "summary": {
      "total_income": 450000,
      "total_expense": 120000,
      "profit": 330000,
      "transactions_count": 8,
      "active_receivables": 250000
    },
    "recent_transactions": [ ... ],
    "active_receivables": [ ... ]
  }
}
```

### Catatan Keamanan

- `LIANA_SHARED_SECRET` HARUS string acak ≥ 32 karakter, simpan di `.env.local` / Vercel env. Jangan commit.
- Endpoint pakai `SUPABASE_SERVICE_ROLE_KEY` (bypass RLS), tapi setiap query/insert eksplisit filter `business_id` dari body — defense in depth.
- Verifikasi auth pakai `crypto.timingSafeEqual` agar aman dari timing attack.

## Deploy ke Vercel

Project sudah siap deploy ke Vercel dengan minimal config. Build sudah pass clean lint+typescript.

### 1. Push repo ke GitHub/GitLab

```bash
git add .
git commit -m "Sprint 8 ready"
git push origin main
```

### 2. Import project di Vercel

1. Buka https://vercel.com/new
2. Import repo. Vercel auto-detect Next.js 16.
3. **Root Directory**: kalau monorepo, pilih `umkm-dashboard`. Kalau tidak, default OK.
4. Framework Preset: **Next.js** (auto)
5. Build Command: `npm run build` (default)
6. Output Directory: `.next` (default)

### 3. Set Environment Variables di Vercel

Settings → Environment Variables → tambahkan:

| Variable | Value | Scope |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL project Supabase | All envs |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key | All envs |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (rahasia) | All envs |
| `LIANA_SHARED_SECRET` | String acak ≥ 32 karakter | Production + Preview |
| `NEXT_PUBLIC_DEMO_BUSINESS_ID` | UUID dari `supabase/seed.sql` | All envs |
| `NEXT_PUBLIC_APP_URL` | `https://your-app.vercel.app` | Production |

> **Penting**: Jangan paste `SUPABASE_SERVICE_ROLE_KEY` atau `LIANA_SHARED_SECRET` dengan prefix `NEXT_PUBLIC_` — itu akan di-bundle ke JS browser.

### 4. Konfigurasi Supabase untuk Production

Supabase Dashboard → Authentication → URL Configuration:

- **Site URL**: `https://your-app.vercel.app`
- **Redirect URLs**: tambahkan `https://your-app.vercel.app/auth/callback`

Tanpa ini, link konfirmasi email akan redirect ke `localhost:3000`.

### 5. Deploy

Tekan **Deploy** di Vercel. Setelah hijau, buka URL deployment.

### 6. Update `NEXT_PUBLIC_APP_URL` (kalau pakai custom domain)

Setelah set custom domain di Vercel, update env `NEXT_PUBLIC_APP_URL` ke domain asli, lalu redeploy. Ini dipakai untuk `metadataBase` (OG image absolute URLs).

## Smoke Test Checklist

Setelah deploy, jalankan checklist berikut untuk pastikan semua fitur jalan:

### Auth & Onboarding
- [ ] `/signup` — daftar akun baru → email verification → redirect login
- [ ] `/login` — login → redirect `/dashboard`
- [ ] Logout dari sidebar → redirect `/login`

### Dashboard
- [ ] `/dashboard` — 4 summary cards muncul dengan angka 0 (akun baru)
- [ ] Chart 7 hari muncul (kosong tapi axis tetap render)
- [ ] Sapaan "Halo, {nama}." sesuai profile

### Transactions
- [ ] `/transactions` — tombol "+ Tambah Transaksi" buka dialog
- [ ] Tambah pemasukan → muncul di tabel + dashboard summary update
- [ ] Tambah pengeluaran → laba di dashboard turun
- [ ] Edit → simpan → angka di dashboard ikut berubah
- [ ] Hapus → confirm dialog → soft delete (tidak muncul tapi data ada)
- [ ] Filter tanggal/type/kategori jalan, URL sharable

### Receivables
- [ ] `/receivables` — tambah piutang baru → status `unpaid` → **dashboard income TIDAK naik** ✅
- [ ] Bayar sebagian → status `partial`, sisa terhitung
- [ ] Tandai lunas → status `paid`, tidak muncul di "active"
- [ ] **Atomicity**: hitung manual: pemasukan = sebelumnya + amount pembayaran ✅

### Reports
- [ ] `/reports` — preset "Hari ini" sampai "Bulan lalu" jalan
- [ ] Custom date range jalan
- [ ] Chart trend render (line atau area sesuai jumlah hari)
- [ ] Breakdown kategori sortir DESC dengan persen
- [ ] **Export CSV** → buka di Excel → kolom rapi, encoding UTF-8 ✅

### Settings
- [ ] Edit nama profile → sidebar update
- [ ] Edit nama bisnis → header dashboard update
- [ ] CRUD kategori (income/expense/receivable) jalan, slug auto-generate
- [ ] Hapus kategori yang dipakai → transaksi tetap aman, kolom kategori jadi kosong

### API Liana
- [ ] `GET /api/liana/health` (no auth) return `{ok: true}`
- [ ] `POST /api/liana/finance-input` tanpa header → 401
- [ ] `POST /api/liana/finance-input` dengan secret salah → 401
- [ ] `POST /api/liana/finance-input` valid → 201 + transaksi muncul di `/transactions`
- [ ] `POST /api/liana/receivable-payment` dengan `customer_name` → resolve ke piutang aktif
- [ ] `GET /api/liana/recap?period=today` → return summary

### Hardening
- [ ] Buka URL random `/halaman-tidak-ada` → render `not-found.tsx` custom
- [ ] Force error (mis. set env Supabase salah) → render `error.tsx` dengan tombol "Coba lagi"
- [ ] Headers response punya `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`

## Catatan Next.js 16

Project ini pakai **Next.js 16** yang punya breaking changes dari Next.js 15. Beberapa hal penting:

- `params` dan `searchParams` di page/layout sekarang `Promise<...>` — **wajib `await`**.
- `cookies()`, `headers()`, `draftMode()` semua **async**.
- File `middleware.ts` deprecated → pakai `proxy.ts` (named export `proxy`). Tidak ada edge runtime di proxy.
- `revalidateTag('tag', 'profile')` butuh argumen kedua (cacheLife profile). Pakai `updateTag('tag')` di Server Action untuk read-your-writes.
- Turbopack default untuk `next dev` dan `next build`.
- `images.domains` deprecated → pakai `images.remotePatterns`.

Salinan docs resmi yang relevan disimpan di `docs/_nextjs-ref/` untuk referensi cepat (tidak commit ke npm tapi dicommit di git supaya offline).

