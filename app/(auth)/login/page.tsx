import type { Metadata } from "next";

import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Masuk",
};

interface LoginPageProps {
  searchParams: Promise<{
    redirect?: string;
    error?: string;
  }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const sp = await searchParams;
  const redirect = sp.redirect ?? null;
  const callbackError = sp.error ?? null;

  return <LoginForm redirect={redirect} callbackError={callbackError} />;
}
