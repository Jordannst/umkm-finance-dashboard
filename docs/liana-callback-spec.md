# Spec: Liana → Dashboard Callback

Untuk fitur **inline chat panel** di dashboard UMKM Finance, kita butuh
Liana POST balik ke endpoint kita setelah reply hook selesai dikirim ke
Telegram (atau gagal). Tanpa callback, dashboard tidak tahu kapan reply
selesai → user stuck staring ke Telegram.

## Flow tinggi level

```
Dashboard → POST /hooks/agent (dengan callback config)  → OpenClaw
OpenClaw  → process + send Telegram                              ↓
OpenClaw  → POST <callback.url>  (saat delivery selesai)  → Dashboard
                                                                 ↓
Dashboard → UPDATE row liana_runs  → Realtime push  → UI update real-time
```

## 1. Cara dashboard kirim callback config (sudah implemented)

Saat dashboard POST ke `https://liana.jordannst.dev/hooks/agent`, body
sekarang sudah include field `callback`:

```jsonc
{
  "name": "Lianaa",
  "message": "Bantu analisis pengeluaran bulan ini",
  "sessionKey": "hook:umkm-dashboard:af6e321c-467a-402a-be5f-8efdf7904214",
  "wakeMode": "now",
  "deliver": true,
  "channel": "telegram",
  "to": "telegram:1304543553",
  "timeoutSeconds": 60,
  "callback": {
    "url": "https://umkm-finance-dashboard.vercel.app/api/liana/run-callback",
    "headers": {
      "Authorization": "Bearer <OPENCLAW_HOOK_TOKEN>",
      "Content-Type": "application/json"
    },
    "metadata": {
      "dashboardRunId": "<UUID dari row liana_runs>",
      "userId": "<auth.users.id>",
      "businessId": "<businesses.id>"
    },
    "events": ["delivered", "error"]
  }
}
```

Liana yang belum support fitur ini akan **abaikan field `callback`**
(graceful: hook tetap dilayani; cuma tidak ada notifikasi delivery di
dashboard).

## 2. Yang perlu Liana implement

### 2.1 Trigger callback

OpenClaw, saat memproses inbound `/hooks/agent` dengan field `callback`,
harus POST ke `callback.url` di event-event berikut:

| Event | Kapan trigger | Status di body |
|---|---|---|
| `delivered` | Reply Liana sudah berhasil dikirim ke Telegram (HTTP 200 dari Telegram API) | `"delivered"` |
| `error`     | Salah satu step gagal: agent run error, Telegram API error, timeout, dll | `"error"` |

Liana **boleh kirim** event lain (`accepted`, `processing`, dll) — kita
abaikan semua selain `delivered`/`done` dan `error`/`failed`.

### 2.2 HTTP request format

```
POST <callback.url>
Content-Type: application/json
Authorization: Bearer <OPENCLAW_HOOK_TOKEN>     # dari callback.headers
```

### 2.3 Body shape — kasus sukses delivery

```jsonc
{
  "status": "delivered",                      // wajib
  "runId": "6ba43c95-0450-43dd-bdc2-36002a51efad",  // dari OpenClaw
  "replyText": "Pengeluaranmu bulan ini Rp 5.2jt, breakdown: ...",  // teks final yang dikirim ke Telegram
  "replyFormat": "plain",                     // optional: "plain" | "markdown", default "plain"
  "deliveredAt": "2026-04-28T10:23:45.000Z",  // optional, ISO 8601
  "metadata": {                               // echo dari hook payload, WAJIB diteruskan
    "dashboardRunId": "ec0ff112-...",
    "userId": "af6e321c-...",
    "businessId": "11111111-..."
  }
}
```

**Penting**: `replyText` harus berisi text final yang dikirim ke Telegram
**TANPA** prefix echo "📝 Pertanyaan dari dashboard" — dashboard sudah
punya prompt-nya sendiri di `liana_runs.prompt`. Cukup kirim teks jawaban.

Kalau memang sulit memisahkan echo dari jawaban, kirim full text lalu
kita strip di sisi dashboard. Tapi preferred adalah text bersih.

### 2.4 Body shape — kasus error

```jsonc
{
  "status": "error",
  "runId": "6ba43c95-...",
  "error": "telegram api 403: bot was blocked by the user",  // pesan teknis
  "metadata": {
    "dashboardRunId": "ec0ff112-...",
    "userId": "af6e321c-...",
    "businessId": "11111111-..."
  }
}
```

### 2.5 Auth

Liana harus include header **`Authorization: Bearer <token>`** persis
seperti yang dikirim di `callback.headers` saat hook outbound. Token ini
sama dengan `OPENCLAW_HOOK_TOKEN` (symmetric — Liana yang punya token
saat outbound, dia pakai token yang sama saat callback).

Dashboard akan tolak callback dengan token salah → HTTP 401.

### 2.6 Retry policy (recommended)

Kalau dashboard return non-2xx (timeout, 5xx, network error), Liana
sebaiknya retry dengan exponential backoff:

- Attempt 1: immediate
- Attempt 2: 5 detik kemudian
- Attempt 3: 30 detik kemudian
- Attempt 4: 2 menit kemudian
- Lalu give up (log error)

Total max retry window: ~3 menit.

**Idempotent**: dashboard handle callback by `metadata.dashboardRunId`,
multi-invocation aman (UPDATE selalu deterministik). Liana boleh retry
berapa kali pun tanpa worry duplicate state.

### 2.7 Timeout

Dashboard akan respond dalam < 5 detik untuk callback. Liana set HTTP
client timeout ~10 detik. Kalau timeout dianggap retry-able.

## 3. Response yang Liana akan terima dari dashboard

### 3.1 Sukses

```jsonc
HTTP/1.1 200 OK
Content-Type: application/json

{ "ok": true, "data": { "matched": true, "status": "done" } }
```

### 3.2 Row tidak ketemu (bukan error fatal — Liana **TIDAK** perlu retry)

```jsonc
HTTP/1.1 200 OK

{ "ok": true, "data": { "matched": false } }
```

Bisa terjadi kalau `dashboardRunId` invalid (race condition atau callback
dari run lama yang sudah dihapus). Liana **TIDAK** retry — ini bukan
network error, sudah terima 200.

### 3.3 Auth gagal

```jsonc
HTTP/1.1 401 Unauthorized

{ "ok": false, "error": { "code": "unauthorized", "message": "Token tidak valid." } }
```

Liana **TIDAK** retry — ini config issue, perlu fix env var.

### 3.4 Validation gagal

```jsonc
HTTP/1.1 400 Bad Request

{ "ok": false, "error": { "code": "validation_failed", "message": "..." } }
```

Liana **TIDAK** retry — body bermasalah, perlu fix code.

## 4. Test plan

### 4.1 Test dari dashboard (end-to-end)

1. User klik tombol Tanya Liana di `/dashboard`
2. Dashboard POST ke `/hooks/agent` dengan `callback` field
3. OpenClaw schedule run + ack ke dashboard (200 dengan runId)
4. OpenClaw process run → kirim ke Telegram → success
5. **OpenClaw POST ke `<callback.url>`** dengan body `status=delivered`
6. Dashboard update `liana_runs` row → push via Supabase Realtime
7. UI dashboard render reply di inline chat panel

### 4.2 Test curl manual (tanpa dashboard)

```bash
# Trigger hook dengan callback URL test
curl -sS -i -X POST https://liana.jordannst.dev/hooks/agent \
  -H "Authorization: Bearer <HOOK_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "name":"test",
    "message":"halo Liana",
    "deliver":true,
    "channel":"telegram",
    "to":"telegram:1304543553",
    "callback":{
      "url":"https://webhook.site/<unique-url>",
      "headers":{"Authorization":"Bearer <HOOK_TOKEN>"},
      "metadata":{"dashboardRunId":"00000000-0000-0000-0000-000000000001"},
      "events":["delivered","error"]
    }
  }'
```

Lalu verify di webhook.site bahwa POST callback masuk dengan body sesuai
spec di atas.

## 5. Catatan implementasi (untuk Liana)

- Field `callback` di hook payload **opsional**. Hook tanpa `callback`
  tetap berfungsi seperti biasa (Liana balas Telegram, tidak ada callback).
- `callback.metadata` arbitrary key-value — Liana echo balik apa adanya
  di body callback. **Tidak ada interpretasi** di sisi Liana.
- Eksekusi callback **async** — jangan blok response 200 ke caller hook.
- Log setiap callback attempt + response (untuk debugging).
- Pertimbangkan toggle config `hooks.allowCallback: true` (default true)
  untuk hard-disable fitur ini per-instance.

## 6. Roadmap (after MVP)

- **Streaming partial reply**: callback di tengah generate text → dashboard
  bisa render token-by-token (advanced, nice-to-have).
- **Multiple events per run**: `accepted`, `processing`, `delivered` →
  dashboard tampilkan progress bar.
- **Webhook signing**: HMAC signature di header `X-Liana-Signature`
  selain Bearer token, defense-in-depth.
