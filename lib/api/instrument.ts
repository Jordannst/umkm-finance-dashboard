/**
 * Helper untuk timing async operations dalam API handler.
 * Pure: hanya measure + return. Logging dilakukan di call site supaya
 * format string konsisten (route name, status code) tetap di handler.
 *
 * Usage:
 *   const { result, durationMs } = await withTiming(() => getLianaRecap(...));
 *   console.log(`[api] route=/api/liana/recap db_ms=${durationMs}`);
 */
export async function withTiming<T>(
  handler: () => Promise<T>,
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
