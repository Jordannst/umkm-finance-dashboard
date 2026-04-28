import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { LianaChatPanel } from "@/components/liana/liana-chat-panel";
import { LianaPillStack } from "@/components/liana/liana-pill-stack";
import { LianaUIProvider } from "@/components/liana/liana-ui-context";
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
  const botUsername =
    process.env.NEXT_PUBLIC_OPENCLAW_BOT_USERNAME?.trim() || undefined;

  // LianaUIProvider mempersatukan state pill + chat panel + useLianaRuns
  // subscription untuk seluruh authenticated tree. AskLianaButton di mana
  // pun di-render bisa push pill (lewat useLianaUIOptional), dan
  // LianaPillStack + LianaChatPanel consume context yang sama.
  return (
    <LianaUIProvider userId={profile.id}>
      <AppShell
        businessName={business?.name ?? "UMKM"}
        ownerName={profile.full_name ?? null}
      >
        {children}
        <LianaChatPanel botUsername={botUsername} />
        <LianaPillStack />
      </AppShell>
    </LianaUIProvider>
  );
}
