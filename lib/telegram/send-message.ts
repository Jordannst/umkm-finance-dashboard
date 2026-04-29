import "server-only";

/**
 * Telegram Bot API wrapper untuk send message ke chat_id user.
 *
 * Dipakai oleh /api/liana/ask untuk echo user prompt ke Telegram chat
 * mereka sendiri SEBELUM forward ke Liana via OpenClaw. Tujuannya:
 * conversation context lengkap (pertanyaan + jawaban dua-duanya
 * keliatan di Telegram).
 *
 * Kenapa dashboard yang echo, bukan OpenClaw?
 *  OpenClaw punya internal extension `hook-prompt-echo` yang harusnya
 *  echo prompt ke channel, tapi behaviour-nya tidak konsisten — sempat
 *  fire (gateway 2026.4.25), tidak fire setelah upgrade ke 2026.4.26
 *  bahkan ketika pakai magic phrase yang plugin recognize. Daripada
 *  depend pada plugin yang behaviour-nya bisa berubah, dashboard kontrol
 *  echo sendiri via Bot API.
 *
 * Best-effort: error di-log tapi tidak throw. Caller harus perlakukan
 * call ini sebagai non-critical — kalau gagal, ask flow tetap jalan
 * normal (cuma user gak liat echo di Telegram).
 *
 * Env var (in order of precedence):
 *   - TELEGRAM_BOT_TOKEN
 *   - OPENCLAW_TELEGRAM_BOT_TOKEN (alternative name yang konsisten dengan
 *     env var Vercel yang lain seperti OPENCLAW_HOOK_TOKEN)
 * Format: "<bot_id>:<secret>" dari BotFather.
 * Kalau dua-duanya tidak set → return ok=false silently, ask flow lanjut.
 */

export interface SendTelegramMessageParams {
  /** Telegram chat_id user (numerik string atau "@username"). */
  chatId: string;
  /** Body text. Plain text by default. */
  text: string;
  /** Optional formatting. "Markdown" lebih simple, "HTML" lebih robust. */
  parseMode?: "Markdown" | "MarkdownV2" | "HTML";
}

export interface SendTelegramMessageResult {
  ok: boolean;
  /** Hanya ada saat ok=false — untuk logging. */
  errorMessage?: string;
}

const TELEGRAM_API_TIMEOUT_MS = 5_000;

export async function sendTelegramMessage(
  params: SendTelegramMessageParams,
): Promise<SendTelegramMessageResult> {
  // Cek 2 env var (dengan precedence). Liana di VPS pakai naming
  // OPENCLAW_TELEGRAM_BOT_TOKEN; standar generic adalah TELEGRAM_BOT_TOKEN.
  // Support keduanya supaya gak ada friction config.
  const token = (
    process.env.TELEGRAM_BOT_TOKEN?.trim() ||
    process.env.OPENCLAW_TELEGRAM_BOT_TOKEN?.trim() ||
    ""
  );
  if (!token) {
    // Silent skip — token belum dikonfigurasi. Bukan error karena fitur
    // echo bersifat enhancement, bukan critical path.
    return {
      ok: false,
      errorMessage:
        "TELEGRAM_BOT_TOKEN / OPENCLAW_TELEGRAM_BOT_TOKEN belum dikonfigurasi.",
    };
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TELEGRAM_API_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: params.chatId,
        text: params.text,
        ...(params.parseMode ? { parse_mode: params.parseMode } : {}),
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        errorMessage: `Telegram API HTTP ${res.status}: ${body.slice(0, 200)}`,
      };
    }
    return { ok: true };
  } catch (err) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      errorMessage: isAbort
        ? `Telegram API timeout (${TELEGRAM_API_TIMEOUT_MS}ms).`
        : `Telegram API error: ${err instanceof Error ? err.message : "unknown"}`,
    };
  } finally {
    clearTimeout(timer);
  }
}
