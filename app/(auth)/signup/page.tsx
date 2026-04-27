import type { Metadata } from "next";

import { SignupForm } from "@/components/auth/signup-form";

export const metadata: Metadata = {
  title: "Daftar",
};

interface SignupPageProps {
  searchParams: Promise<{
    redirect?: string;
  }>;
}

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const sp = await searchParams;
  const redirect = sp.redirect ?? null;

  return <SignupForm redirect={redirect} />;
}
