/**
 * Buat slug ASCII dari teks bebas. Cocok untuk category.slug.
 *
 * Aturan:
 *  - Lowercase
 *  - Spasi & non-alphanumeric → underscore
 *  - Trim leading/trailing underscore
 *  - Ambil maksimal 64 karakter
 */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip accent
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}
