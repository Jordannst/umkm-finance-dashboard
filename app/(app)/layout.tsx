import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { LianaChatPanel } from "@/components/liana/liana-chat-panel";
import {
  getCurrentBusiness,
  getCurrentProfile,
} from "@/lib/finance/business";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();
  if (!profile) {
    // Backstop untuk kasus proxy.ts tidak menjangkau route ini.
    redirect("/login");
  }

  const business = await getCurrentBusiness();
  const botUsername = process.env.NEXT_PUBLIC_OPENCLAW_BOT_USERNAME?.trim() || undefined;

  return (
    <AppShell
      businessName={business?.name ?? "UMKM"}
      ownerName={profile.full_name ?? null}
    >
      {children}
      <LianaChatPanel userId={profile.id} botUsername={botUsername} />
    </AppShell>
  );
}
