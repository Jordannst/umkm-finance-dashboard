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
import { signUpAction, type AuthState } from "@/lib/auth/actions";

const initialState: AuthState = { ok: false };

interface SignupFormProps {
  redirect: string | null;
}

export function SignupForm({ redirect }: SignupFormProps) {
  const [state, formAction, pending] = useActionState(
    signUpAction,
    initialState,
  );

  return (
    <Card>
      <CardHeader className="space-y-1.5">
        <CardTitle className="text-2xl">Buat akun baru</CardTitle>
        <CardDescription>
          Daftarkan diri sebagai owner. Akun pertama otomatis terhubung ke
          UMKM demo.
        </CardDescription>
      </CardHeader>
      <form action={formAction} noValidate>
        <CardContent className="space-y-4">
          {redirect && (
            <input type="hidden" name="redirect" value={redirect} />
          )}
          {state.message && (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {state.message}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="full_name">Nama lengkap</Label>
            <Input
              id="full_name"
              name="full_name"
              type="text"
              autoComplete="name"
              placeholder="Owner Demo"
              required
              aria-invalid={Boolean(state.fieldErrors?.full_name)}
              aria-describedby={
                state.fieldErrors?.full_name ? "full-name-error" : undefined
              }
            />
            {state.fieldErrors?.full_name && (
              <p id="full-name-error" className="text-xs text-destructive">
                {state.fieldErrors.full_name}
              </p>
            )}
          </div>
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
              autoComplete="new-password"
              required
              aria-invalid={Boolean(state.fieldErrors?.password)}
              aria-describedby={
                state.fieldErrors?.password ? "password-error" : undefined
              }
            />
            <p className="text-xs text-muted-foreground">
              Minimal 8 karakter.
            </p>
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
            Daftar
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Sudah punya akun?{" "}
            <Link
              href={
                redirect
                  ? `/login?redirect=${encodeURIComponent(redirect)}`
                  : "/login"
              }
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Masuk
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
