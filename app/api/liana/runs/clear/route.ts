import { apiError, apiOk } from "@/lib/api/responses";
import { clearCompletedRunsForUser } from "@/lib/finance/liana/runs";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/liana/runs/clear
 *
 * Hapus semua "Tanya Liana" history user yang sudah selesai (status
 * 'done' atau 'error'). Run yang masih 'pending' SENGAJA dipertahankan
 * supaya conversation in-flight tidak ke-cancel di tengah jalan.
 *
 * Auth: Supabase session (user login di dashboard).
 * Body: tidak ada — operasi ini scoped ke user dari session.
 *
 * Response sukses:
 *   { ok: true, data: { deletedCount: <number> } }
 *
 * Setelah delete, Realtime DELETE event akan otomatis di-broadcast ke
 * semua subscriber dari user ini, sehingga UI dashboard yang lain auto
 * sync (lihat hooks/use-liana-runs.ts DELETE listener).
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return apiError("unauthorized", "Sesi tidak valid. Login ulang.", 401);
  }

  const result = await clearCompletedRunsForUser({ userId: user.id });
  if (!result.ok) {
    return apiError(
      "delete_failed",
      "Gagal menghapus riwayat. Coba lagi sebentar.",
      500,
    );
  }

  return apiOk({ deletedCount: result.deletedCount });
}
