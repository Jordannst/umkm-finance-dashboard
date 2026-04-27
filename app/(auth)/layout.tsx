import Link from "next/link";
import { Wallet2 } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center px-4 md:px-8">
          <Link href="/" className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Wallet2 className="h-5 w-5" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold">
                Dashboard Keuangan UMKM
              </span>
              <span className="text-xs text-muted-foreground">
                Terintegrasi dengan Liana
              </span>
            </div>
          </Link>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-10 md:py-16">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
