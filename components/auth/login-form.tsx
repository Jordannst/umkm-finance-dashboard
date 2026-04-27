"use client";

import * as React from "react";
import Link from "next/link";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInAction, type AuthState } from "@/lib/auth/actions";

const initialState: AuthState = { ok: false };

interface LoginFormProps {
  redirect: string | null;
  callbackError: string | null;
}

export function LoginForm({ redirect, callbackError }: LoginFormProps) {
  const [state, formAction, pending] = useActionState(
    signInAction,
    initialState,
  );

  const message =
    state.message ??
    (callbackError === "callback-failed"
      ? "Verifikasi gagal. Coba kirim ulang link konfirmasi."
      : callbackError === "missing-code"
        ? "Tautan tidak valid. Silakan login ulang."
        : null);

  return (
    <Card>
      <CardHeader className="space-y-1.5">
        <CardTitle className="text-2xl">Masuk ke akun</CardTitle>
        <CardDescription>
          Pakai email dan password yang kamu daftarkan untuk masuk ke
          dashboard keuangan.
        </CardDescription>
      </CardHeader>
      <form action={formAction} noValidate>
        <CardContent className="space-y-4">
          {redirect && (
            <input type="hidden" name="redirect" value={redirect} />
          )}
          {message && (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {message}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="owner@umkm.id"
              required
              aria-invalid={Boolean(state.fieldErrors?.email)}
              aria-describedby={
                state.fieldErrors?.email ? "email-error" : undefined
              }
            />
            {state.fieldErrors?.email && (
              <p id="email-error" className="text-xs text-destructive">
                {state.fieldErrors.email}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              aria-invalid={Boolean(state.fieldErrors?.password)}
              aria-describedby={
                state.fieldErrors?.password ? "password-error" : undefined
              }
            />
            {state.fieldErrors?.password && (
              <p id="password-error" className="text-xs text-destructive">
                {state.fieldErrors.password}
              </p>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex-col items-stretch gap-3">
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Masuk
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Belum punya akun?{" "}
            <Link
              href={
                redirect
                  ? `/signup?redirect=${encodeURIComponent(redirect)}`
                  : "/signup"
              }
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Daftar di sini
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
