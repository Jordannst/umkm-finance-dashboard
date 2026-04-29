/**
 * Helper untuk timing async operations dalam API handler.
 * Pure: hanya measure + return. Logging dilakukan di call site supaya
 * format string konsisten (route name, status code) tetap di handler.
 *
 * Pakai `PromiseLike<T>` (bukan `Promise<T>`) supaya bisa wrap thenable
 * yang bukan Promise murni \u2014 contohnya Supabase PostgrestBuilder yang
 * dikembalikan oleh `.from(...).insert(...).select().single()`. PostgrestBuilder
 * punya `.then()` jadi compatible dengan `await`, tapi missing
 * `.catch()` / `.finally()` jadi gak match `Promise<T>` strict.
 *
 * Usage:
 *   const { result, durationMs } = await withTiming(() => getLianaRecap(...));
 *   console.log(`[api] route=/api/liana/recap db_ms=${durationMs}`);
 */
export async function withTiming<T>(
  handler: () => PromiseLike<T>,
): Promise<{ result: T; durationMs: number }> {
  const start = Date.now();
  const result = await handler();
  return { result, durationMs: Date.now() - start };
}

/**
 * Sync variant. Berguna untuk wrap sync operations seperti
 * `verifyLianaAuth` yang return Response | null tanpa Promise.
 */
export function withTimingSync<T>(handler: () => T): {
  result: T;
  durationMs: number;
} {
  const start = Date.now();
  const result = handler();
  return { result, durationMs: Date.now() - start };
}
