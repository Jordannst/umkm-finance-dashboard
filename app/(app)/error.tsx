"use client";

import * as React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Error boundary untuk grup `(app)`. Tertangkap saat Server Component
 * throw atau Client Component error setelah mount.
 *
 * `reset()` me-mount ulang segment yang error tanpa full reload.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // Log untuk observability (di prod sambungkan ke Sentry/log service).
    console.error("[(app) error boundary]:", error);
  }, [error]);

  return (
    <div className="grid place-items-center py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="h-6 w-6" aria-hidden />
          </div>
          <CardTitle className="mt-2">Ada yang error</CardTitle>
          <CardDescription>
            Terjadi kesalahan saat memuat halaman ini. Coba lagi, atau
            kembali ke dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {error.digest && (
            <p className="text-center text-xs text-muted-foreground">
              Kode error:{" "}
              <code className="rounded bg-muted px-1">{error.digest}</code>
            </p>
          )}
          <div className="flex justify-center gap-2">
            <Button onClick={reset}>
              <RotateCcw className="h-4 w-4" />
              Coba lagi
            </Button>
            <Button variant="outline" asChild>
              <a href="/dashboard">Ke dashboard</a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
