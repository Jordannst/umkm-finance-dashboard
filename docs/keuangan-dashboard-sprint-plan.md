# Sprint Plan — Dashboard Keuangan UMKM

Tanggal mulai rencana: 2026-04-27
Stack: Next.js + TypeScript + Tailwind + shadcn/ui + Supabase
Dokumen induk: `umkm/plans/keuangan-dashboard-nextjs-supabase-plan.md`

## Cara Membaca Sprint

- Durasi sprint fleksibel: 2-4 hari per sprint untuk tugas/demo cepat.
- Jangan lanjut sprint besar sebelum acceptance criteria sprint sebelumnya aman.
- Setiap sprint harus punya hasil yang bisa dicoba, bukan cuma code mentah.
- Integrasi Liana jangan ditaruh paling akhir; minimal API contract harus dibuat dari awal.

---

## Sprint 0 — Finalisasi Blueprint & Setup Repo

### Goal
Menyiapkan fondasi project supaya implementasi tidak salah arah.

### Tasks
- [ ] Tentukan nama repo, contoh: `umkm-finance-dashboard`.
- [ ] Create Next.js App Router project dengan TypeScript.
- [ ] Install Tailwind CSS.
- [ ] Install shadcn/ui.
- [ ] Install Supabase client.
- [ ] Install Recharts.
- [ ] Buat struktur folder awal.
- [ ] Setup `.env.example`.
- [ ] Buat README setup lokal.

### Struktur folder rekomendasi
```text
src/
  app/
    dashboard/
    transactions/
    receivables/
    reports/
    settings/
    api/
      liana/
      transactions/
      receivables/
      reports/
  components/
    dashboard/
    transactions/
    receivables/
    reports/
    ui/
  lib/
    supabase/
    finance/
    utils.ts
  types/
    finance.ts
supabase/
  migrations/
  seed.sql
```

### Acceptance Criteria
- Project bisa run lokal.
- Landing/dashboard shell tampil.
- README punya instruksi install dan env.
- `.env.example` tidak berisi secret asli.

### Output sprint
- Repo Next.js kosong tapi rapi.
- Layout dasar siap.

---

## Sprint 1 — Supabase Schema & Seed Data

### Goal
Membuat database Supabase yang siap dipakai dashboard dan Liana.

### Tasks
- [ ] Buat migration SQL untuk tabel:
  - `businesses`
  - `profiles`
  - `categories`
  - `transactions`
  - `receivables`
  - `receivable_payments`
- [ ] Tambahkan default categories.
- [ ] Tambahkan seed business demo.
- [ ] Buat helper Supabase server/client.
- [ ] Buat TypeScript finance types.
- [ ] Buat query helper untuk summary.

### Default categories
Income:
- penjualan
- pembayaran_piutang
- pendapatan_lain

Expense:
- bahan_baku
- kemasan
- operasional
- transport
- utilitas
- gaji
- lain_lain

Receivable:
- pelanggan_belum_bayar
- tempo
- titip_bayar

### Acceptance Criteria
- Semua tabel berhasil dibuat di Supabase.
- Seed data masuk.
- Query summary bisa hitung dari data dummy.
- Tidak ada service role key di client/browser.

### Output sprint
- Database siap.
- Types dan helper awal siap.

---

## Sprint 2 — Dashboard Overview

### Goal
User bisa melihat kondisi keuangan utama dari satu halaman.

### Tasks
- [ ] Buat `/dashboard` page.
- [ ] Buat summary cards:
  - pemasukan hari ini
  - pengeluaran hari ini
  - laba sederhana
  - piutang aktif
- [ ] Buat grafik pemasukan vs pengeluaran 7 hari terakhir.
- [ ] Buat transaksi terbaru.
- [ ] Buat piutang aktif/terbaru.
- [ ] Tambahkan loading, empty, dan error state.

### Acceptance Criteria
- Dashboard menampilkan angka benar dari Supabase.
- Jika data kosong, tampil empty state yang jelas.
- UI responsive di mobile dan desktop.
- Angka rupiah diformat rapi.

### Output sprint
- Dashboard overview sudah bisa didemo.

---

## Sprint 3 — CRUD Transaksi

### Goal
User bisa menambah dan mengelola pemasukan/pengeluaran dari website.

### Tasks
- [ ] Buat `/transactions` page.
- [ ] Buat table transaksi.
- [ ] Buat form tambah transaksi.
- [ ] Support type `income` dan `expense`.
- [ ] Support category, note, amount, date.
- [ ] Buat edit transaksi.
- [ ] Buat soft delete/void transaksi dengan confirm dialog.
- [ ] Buat filter tanggal/type/category.
- [ ] Buat API route transaksi jika tidak pakai server actions langsung.

### Acceptance Criteria
- Bisa tambah pemasukan.
- Bisa tambah pengeluaran.
- Bisa edit data transaksi.
- Bisa soft delete transaksi.
- Summary dashboard ikut berubah setelah data berubah.

### Output sprint
- Manajemen transaksi website siap.

---

## Sprint 4 — Piutang Management

### Goal
User bisa melacak piutang dan pembayaran piutang dengan benar.

### Tasks
- [ ] Buat `/receivables` page.
- [ ] Buat table piutang.
- [ ] Buat form tambah piutang.
- [ ] Buat action pembayaran sebagian.
- [ ] Buat action tandai lunas.
- [ ] Insert ke `receivable_payments` saat pembayaran.
- [ ] Insert ke `transactions` type `receivable_payment` saat pembayaran.
- [ ] Update `paid_amount` dan `status` otomatis.
- [ ] Tampilkan sisa piutang.

### Acceptance Criteria
- Piutang baru tidak menambah pemasukan.
- Pembayaran piutang menambah pemasukan.
- Partial payment menghitung sisa dengan benar.
- Lunas mengubah status jadi `paid`.
- Piutang aktif di dashboard benar.

### Output sprint
- Piutang workflow siap.

---

## Sprint 5 — Reports & Rekap

### Goal
User bisa melihat rekap harian/mingguan dan laporan sederhana.

### Tasks
- [ ] Buat `/reports` page.
- [ ] Buat rekap hari ini.
- [ ] Buat rekap minggu ini.
- [ ] Buat custom date range sederhana.
- [ ] Hitung total pemasukan.
- [ ] Hitung total pengeluaran.
- [ ] Hitung laba/rugi sederhana.
- [ ] Hitung piutang aktif.
- [ ] Tampilkan kategori pengeluaran terbesar.

### Acceptance Criteria
- Rekap harian benar.
- Rekap mingguan benar.
- Piutang tampil terpisah.
- Rumus laba sederhana tidak memasukkan piutang belum dibayar.

### Output sprint
- Reports siap untuk owner dan demo.

---

## Sprint 6 — API Integrasi Liana

### Goal
Liana bisa menulis dan membaca data dashboard lewat API aman.

### API target
- `POST /api/liana/finance-input`
- `POST /api/liana/receivable-input`
- `POST /api/liana/receivable-payment`
- `GET /api/liana/recap?period=today|week`

### Tasks
- [ ] Buat shared secret auth untuk endpoint Liana.
- [ ] Buat request validation.
- [ ] Buat handler input transaksi.
- [ ] Buat handler input piutang.
- [ ] Buat handler pembayaran piutang.
- [ ] Buat handler rekap.
- [ ] Buat response format konsisten.
- [ ] Buat contoh curl/API docs di README.

### Request example: finance input
```json
{
  "business_id": "uuid",
  "type": "income",
  "amount": 120000,
  "category_name": "penjualan",
  "note": "jual kopi susu",
  "transaction_date": "2026-04-27",
  "source": "chat",
  "created_by": "Liana"
}
```

### Acceptance Criteria
- Liana bisa POST transaksi via API.
- Liana bisa POST piutang via API.
- Liana bisa POST pembayaran piutang via API.
- Liana bisa GET rekap via API.
- Endpoint menolak request tanpa shared secret.

### Output sprint
- Integrasi chat ↔ dashboard siap.

---

## Sprint 7 — Auth, Settings, Hardening

### Goal
Merapikan akses, konfigurasi bisnis, dan keamanan dasar.

### Tasks
- [ ] Implement Supabase Auth jika belum.
- [ ] Buat `/settings`.
- [ ] Buat profil bisnis.
- [ ] Buat manage categories sederhana.
- [ ] Aktifkan RLS policy yang aman.
- [ ] Pastikan server-only key tidak bocor.
- [ ] Tambahkan validation dan error handling final.

### Acceptance Criteria
- User harus login jika mode production.
- Data business tidak tercampur.
- RLS tidak memblokir fitur normal.
- API Liana tetap berjalan lewat server route aman.

### Output sprint
- App lebih aman dan siap deploy.

---

## Sprint 8 — Deploy & Demo Polish

### Goal
Aplikasi siap diclone, dites, dan dideploy.

### Tasks
- [ ] Setup deploy Vercel atau VPS.
- [ ] Setup env production.
- [ ] Test production build.
- [ ] Test Supabase connection production.
- [ ] Test semua flow utama.
- [ ] Buat demo script.
- [ ] Buat screenshot/demo notes.
- [ ] Rapikan README.

### Demo script minimum
1. Buka dashboard overview.
2. Tambah pemasukan dari dashboard.
3. Tambah pengeluaran dari dashboard.
4. Tambah piutang.
5. Tandai piutang sebagian/lunas.
6. Lihat rekap.
7. Input transaksi lewat Liana/chat API.
8. Dashboard berubah otomatis.

### Acceptance Criteria
- `npm run build` sukses.
- Deploy bisa dibuka.
- Semua demo flow berjalan.
- README cukup jelas untuk clone dan setup.

### Output sprint
- Project siap demo dan deploy.

---

## Priority Cut Jika Waktu Mepet

Kalau waktu sempit, potong fitur dengan urutan ini:

### Harus tetap ada
- Supabase schema
- Dashboard overview
- Tambah pemasukan/pengeluaran
- Tambah piutang
- Rekap sederhana
- API Liana minimal finance input + recap

### Bisa ditunda
- Auth lengkap
- Export PDF/Excel
- Custom date range detail
- Manage categories detail
- Grafik kompleks
- Multi-UMKM UI

---

## Definition of Done Global

Project dianggap siap diserahkan ke Liana untuk clone/deploy kalau:
- Repo punya README setup jelas.
- `.env.example` lengkap.
- Supabase SQL/migrations tersedia.
- Build sukses.
- Dashboard bisa jalan lokal.
- API Liana terdokumentasi.
- Tidak ada secret asli di repo.
- Core finance formula sesuai planning.

## Catatan Untuk Dev

Implementasi terbaik: jangan langsung semua fitur. Mulai dari schema, dashboard overview, transaksi, lalu piutang. Setelah itu baru integrasi Liana. Kalau fondasi data salah, fitur lain akan ikut berantakan.
