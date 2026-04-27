"use client";

/**
 * Last-resort error boundary di root layout. Dipanggil hanya kalau
 * `app/layout.tsx` sendiri yang error (jarang). Wajib render html+body
 * sendiri karena root layout error sebelum sempat render.
 *
 * Untuk error per-segment (dashboard, transactions, dll) pakai
 * `app/(app)/error.tsx`.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="id">
      <body
        style={{
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          margin: 0,
          padding: "2rem 1rem",
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#f8f9fa",
          color: "#1a1a1a",
        }}
      >
        <main
          style={{
            maxWidth: 480,
            width: "100%",
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: "1.5rem",
            boxShadow:
              "0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.06)",
          }}
        >
          <h1 style={{ margin: 0, fontSize: "1.25rem" }}>
            Aplikasi gagal dimuat
          </h1>
          <p style={{ marginTop: 8, color: "#525252", lineHeight: 1.5 }}>
            Ada error fatal saat memuat aplikasi. Coba refresh halaman atau
            hubungi admin kalau masalah berlanjut.
          </p>
          {error.digest && (
            <p
              style={{
                marginTop: 12,
                fontSize: 12,
                color: "#737373",
              }}
            >
              Kode error:{" "}
              <code
                style={{
                  background: "#f3f4f6",
                  padding: "2px 6px",
                  borderRadius: 4,
                }}
              >
                {error.digest}
              </code>
            </p>
          )}
          <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={reset}
              style={{
                padding: "8px 14px",
                background: "#1a1a1a",
                color: "white",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                fontWeight: 500,
              }}
            >
              Coba lagi
            </button>
            <a
              href="/dashboard"
              style={{
                padding: "8px 14px",
                background: "white",
                color: "#1a1a1a",
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                textDecoration: "none",
                fontWeight: 500,
              }}
            >
              Ke dashboard
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
