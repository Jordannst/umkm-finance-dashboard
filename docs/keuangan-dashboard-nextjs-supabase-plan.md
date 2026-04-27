# Planning — Dashboard Keuangan UMKM Next.js + Supabase

Tanggal: 2026-04-27
Status: Draft v1 untuk implementasi awal
Pemilik workflow: Otniel, Dave
Integrasi agent: Liana / OpenClaw chat commands `/keu_*`

## 1. Ringkasan Produk

Dashboard ini adalah website keuangan UMKM yang terintegrasi dengan Agent Keuangan Harian. Tujuannya bukan membuat sistem akuntansi kompleks, tapi membantu owner UMKM melihat kondisi uang harian dengan cepat.

Prinsip utama:
- Chat dengan Liana dipakai untuk input cepat dan tanya rekap.
- Dashboard website dipakai untuk melihat, menganalisis, mengedit, dan mengelola data.
- Piutang tidak dihitung sebagai pemasukan tunai sebelum dibayar.
- Bahasa UI harus sederhana dan owner-friendly.

## 2. Goals / Tujuan

### Tujuan Utama
Membuat dashboard keuangan UMKM berbasis website yang terintegrasi dengan Liana, sehingga owner bisa mencatat, memantau, dan menganalisis kondisi keuangan harian tanpa harus memakai aplikasi akuntansi yang rumit.

### Tujuan Produk
1. Mempermudah pencatatan pemasukan dan pengeluaran harian.
2. Membantu owner melihat laba/rugi sederhana secara cepat.
3. Membuat piutang pelanggan lebih mudah dipantau sampai lunas.
4. Menyediakan dashboard visual untuk ringkasan, tabel, grafik, dan laporan sederhana.
5. Menghubungkan input chat dengan dashboard supaya data bisa masuk dari percakapan natural.
6. Menjadi fondasi sistem keuangan UMKM yang bisa dikembangkan ke multi-UMKM, export laporan, dan insight otomatis.

### Tujuan Untuk Demo / Tugas
1. Menunjukkan bahwa Agent Keuangan Harian bukan hanya konsep chat, tapi punya dashboard nyata.
2. Membuktikan integrasi antara AI assistant, API, database, dan website.
3. Menyediakan alur demo yang jelas: input lewat chat → data masuk Supabase → dashboard berubah → rekap bisa dibaca lagi oleh Liana.
4. Menjaga scope tetap realistis: simple finance tracking, bukan akuntansi penuh.

### Ukuran Keberhasilan
- Owner bisa mencatat transaksi dalam waktu kurang dari 30 detik.
- Dashboard langsung memperbarui summary setelah data masuk.
- Piutang aktif bisa terlihat jelas dan tidak tercampur dengan pemasukan tunai.
- Liana bisa mengirim input dan mengambil rekap lewat API.
- Project bisa diclone, di-setup, dan dideploy dengan dokumentasi yang jelas.

## 3. Stack Final

- Framework: Next.js App Router
- Language: TypeScript
- Styling: Tailwind CSS
- UI kit: shadcn/ui
- Database/Auth: Supabase
- Charts: Recharts
- Deployment target awal: Vercel atau VPS
- Integrasi agent: API route + Supabase service role/server client

## 4. Target MVP

MVP harus cukup untuk demo tugas dan siap dikembangkan lanjut.

Fitur wajib MVP:
1. Dashboard overview
2. CRUD transaksi pemasukan/pengeluaran
3. CRUD piutang sederhana
4. Tandai piutang lunas/sebagian
5. Rekap harian dan mingguan
6. API endpoint untuk input dari Liana/chat
7. API endpoint untuk Liana membaca rekap

Fitur non-MVP / nanti:
- Multi-UMKM penuh
- Export PDF/Excel
- AI insight otomatis tingkat lanjut
- Notifikasi jatuh tempo
- Integrasi order/produk otomatis
- Role permission detail

## 5. Role User

### Admin / Owner UMKM
- Input dan edit transaksi
- Input dan kelola piutang
- Melihat rekap dan dashboard
- Menggunakan chat Liana untuk input cepat

### Liana / Agent
- Menerima input natural dari chat
- Parse input menjadi struktur finance
- Kirim data ke API dashboard
- Ambil rekap dari API/dashboard
- Jawab pertanyaan sederhana berdasarkan data

## 6. Halaman Website

### `/dashboard`
Overview utama.

Komponen:
- Card pemasukan hari ini
- Card pengeluaran hari ini
- Card laba sederhana hari ini
- Card piutang aktif
- Grafik pemasukan vs pengeluaran 7 hari terakhir
- List transaksi terbaru
- List piutang yang perlu perhatian

### `/transactions`
Manajemen pemasukan dan pengeluaran.

Komponen:
- Tabel transaksi
- Filter tanggal
- Filter type: pemasukan/pengeluaran
- Filter kategori
- Form tambah transaksi
- Edit transaksi
- Delete/void transaksi dengan konfirmasi

### `/receivables`
Manajemen piutang.

Komponen:
- Tabel piutang
- Filter status: unpaid / partial / paid
- Tambah piutang
- Tandai pembayaran sebagian
- Tandai lunas
- Sisa piutang
- Due date jika ada

### `/reports`
Rekap dan laporan sederhana.

Komponen:
- Rekap hari ini
- Rekap minggu ini
- Filter rentang tanggal
- Total pemasukan
- Total pengeluaran
- Laba/rugi sederhana
- Total piutang aktif
- Kategori pengeluaran terbesar

### `/settings`
Pengaturan awal.

Komponen:
- Profil bisnis
- Kategori transaksi
- Token/API integration note untuk Liana
- Preferensi mata uang/tanggal

## 7. Data Model Supabase

Gunakan `business_id` dari awal meskipun MVP hanya 1 UMKM. Ini menjaga schema siap multi-UMKM tanpa refactor besar.

### `businesses`
```sql
id uuid primary key default gen_random_uuid(),
name text not null,
owner_name text,
created_at timestamptz not null default now(),
updated_at timestamptz not null default now()
```

### `profiles`
```sql
id uuid primary key references auth.users(id) on delete cascade,
business_id uuid references businesses(id),
full_name text,
role text not null default 'owner',
created_at timestamptz not null default now(),
updated_at timestamptz not null default now()
```

### `categories`
```sql
id uuid primary key default gen_random_uuid(),
business_id uuid references businesses(id) on delete cascade,
type text not null check (type in ('income', 'expense', 'receivable')),
name text not null,
slug text not null,
created_at timestamptz not null default now(),
unique (business_id, type, slug)
```

### `transactions`
```sql
id uuid primary key default gen_random_uuid(),
business_id uuid not null references businesses(id) on delete cascade,
type text not null check (type in ('income', 'expense', 'receivable_payment')),
amount numeric(14,2) not null check (amount > 0),
category_id uuid references categories(id),
category_name text,
note text,
transaction_date date not null default current_date,
source text not null default 'dashboard' check (source in ('dashboard', 'chat', 'system')),
related_receivable_id uuid,
created_by text,
created_at timestamptz not null default now(),
updated_at timestamptz not null default now(),
deleted_at timestamptz
```

### `receivables`
```sql
id uuid primary key default gen_random_uuid(),
business_id uuid not null references businesses(id) on delete cascade,
customer_name text not null,
amount numeric(14,2) not null check (amount > 0),
paid_amount numeric(14,2) not null default 0 check (paid_amount >= 0),
status text not null default 'unpaid' check (status in ('unpaid', 'partial', 'paid')),
category_id uuid references categories(id),
category_name text,
note text,
due_date date,
created_from_source text not null default 'dashboard' check (created_from_source in ('dashboard', 'chat', 'system')),
created_at timestamptz not null default now(),
updated_at timestamptz not null default now(),
deleted_at timestamptz,
check (paid_amount <= amount)
```

### `receivable_payments`
```sql
id uuid primary key default gen_random_uuid(),
business_id uuid not null references businesses(id) on delete cascade,
receivable_id uuid not null references receivables(id) on delete cascade,
transaction_id uuid references transactions(id),
amount numeric(14,2) not null check (amount > 0),
payment_date date not null default current_date,
note text,
source text not null default 'dashboard' check (source in ('dashboard', 'chat', 'system')),
created_at timestamptz not null default now()
```

## 8. API Routes Next.js

### Public/internal API untuk dashboard
- `GET /api/summary?period=today|week|month`
- `GET /api/transactions`
- `POST /api/transactions`
- `PATCH /api/transactions/:id`
- `DELETE /api/transactions/:id` atau soft delete
- `GET /api/receivables`
- `POST /api/receivables`
- `POST /api/receivables/:id/payments`
- `PATCH /api/receivables/:id`
- `GET /api/reports/daily?date=YYYY-MM-DD`
- `GET /api/reports/weekly?date=YYYY-MM-DD`

### API khusus integrasi Liana/chat
- `POST /api/liana/finance-input`
- `POST /api/liana/receivable-input`
- `POST /api/liana/receivable-payment`
- `GET /api/liana/recap?period=today|week`

Catatan keamanan:
- Endpoint Liana harus pakai shared secret/API key server-side.
- Jangan expose Supabase service role key ke browser.
- Semua validasi tetap di server API route.

## 9. Flow Integrasi Chat ↔ Dashboard

### Catat transaksi
```text
User: pemasukan 120000 jual kopi susu
↓
Liana parse:
{ type: 'income', amount: 120000, note: 'jual kopi susu', category: 'penjualan' }
↓
POST /api/liana/finance-input
↓
Supabase insert transactions
↓
Liana confirm: Oke, pemasukan Rp120.000 dicatat.
```

### Catat piutang
```text
User: piutang 200000 Budi pesanan kantor
↓
Liana parse:
{ customer_name: 'Budi', amount: 200000, note: 'pesanan kantor' }
↓
POST /api/liana/receivable-input
↓
Supabase insert receivables status unpaid
↓
Liana confirm: Piutang Budi Rp200.000 dicatat.
```

### Pembayaran piutang
```text
User: Budi sudah bayar 100000
↓
Liana cari receivable aktif Budi
↓
POST /api/liana/receivable-payment
↓
Supabase insert receivable_payments + transaction receivable_payment
↓
Update paid_amount dan status partial/paid
↓
Liana confirm: Pembayaran piutang Budi Rp100.000 dicatat.
```

### Rekap
```text
User: rekap hari ini
↓
Liana GET /api/liana/recap?period=today
↓
Dashboard API hitung summary
↓
Liana jawab rekap owner-friendly
```

## 10. Formula Bisnis

```text
total_pemasukan = sum(transactions.type in income, receivable_payment) pada periode, excluding deleted_at
total_pengeluaran = sum(transactions.type = expense) pada periode, excluding deleted_at
laba_sederhana = total_pemasukan - total_pengeluaran
piutang_aktif = sum(receivables.amount - receivables.paid_amount where status in unpaid/partial, excluding deleted_at)
```

Aturan:
- Piutang baru tidak masuk pemasukan.
- Pembayaran piutang masuk pemasukan sebagai `receivable_payment`.
- Delete sebaiknya soft delete supaya data tidak hilang permanen.

## 11. UX/UI Direction

Vibe: bersih, ringan, owner-friendly, bukan aplikasi akuntansi berat.

Style:
- Background: slate/gray very light
- Primary: emerald/green atau blue
- Warning: amber untuk piutang jatuh tempo
- Danger: red untuk delete/overdue
- Cards besar dengan angka mudah dibaca
- Table sederhana, jangan terlalu padat

State wajib:
- Loading skeleton
- Empty state: belum ada transaksi/piutang
- Error state: gagal memuat/menyimpan data
- Confirm dialog untuk delete/void
- Toast success/error setelah action

## 12. Acceptance Criteria MVP

MVP dianggap selesai kalau:
- User bisa login atau masuk mode demo admin.
- User bisa tambah pemasukan dari dashboard.
- User bisa tambah pengeluaran dari dashboard.
- User bisa tambah piutang dari dashboard.
- User bisa tandai piutang partial/lunas.
- Dashboard overview menghitung summary benar.
- `/api/liana/finance-input` bisa menerima input dari Liana.
- `/api/liana/recap` bisa dibaca Liana.
- Data tersimpan di Supabase.
- README menjelaskan setup env dan deploy.

## 13. Risiko Implementasi

- Scope terlalu besar sejak awal → mitigasi: MVP dulu.
- Supabase auth/RLS bikin lambat → mitigasi: mulai dengan RLS sederhana atau demo admin, lalu harden.
- Perhitungan piutang dobel masuk pemasukan → mitigasi: receivable dan payment dipisah jelas.
- API key Liana bocor → mitigasi: env server-only dan shared secret.
- Dashboard bagus tapi chat integration belum jalan → mitigasi: sprint khusus integrasi API sejak awal.

## 14. Keputusan yang Sudah Dikunci

- Stack: Next.js + Supabase.
- Dashboard berbasis website.
- Chat dengan Liana adalah input dan analisis layer.
- Dashboard adalah review/manage layer.
- Schema tetap pakai `business_id` walaupun MVP single UMKM.

## 15. Keputusan yang Masih Perlu Dikunci

- Nama repo final.
- Deploy target pertama: Vercel atau VPS.
- Login wajib dari awal atau demo admin dulu.
- Apakah pakai Supabase RLS strict sejak sprint 1 atau setelah MVP stabil.
