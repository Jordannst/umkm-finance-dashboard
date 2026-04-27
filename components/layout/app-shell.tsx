"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, Wallet2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { navItems } from "@/components/layout/nav-config";
import { signOutAction } from "@/lib/auth/actions";

interface AppShellProps {
  children: React.ReactNode;
  businessName?: string;
  ownerName?: string | null;
}

export function AppShell({
  children,
  businessName = "UMKM Demo",
  ownerName,
}: AppShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const closeMobile = React.useCallback(() => setMobileOpen(false), []);

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar desktop + drawer mobile */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-200 md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between gap-2 border-b border-sidebar-border px-5">
          <Link
            href="/dashboard"
            className="flex items-center gap-2"
            onClick={closeMobile}
          >
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Wallet2 className="h-5 w-5" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold">{businessName}</span>
              <span className="text-xs text-muted-foreground">
                Dashboard Keuangan
              </span>
            </div>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Tutup menu"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeMobile}
                className={cn(
                  "flex items-start gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <div className="flex flex-col">
                  <span className="font-medium leading-tight">
                    {item.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {item.description}
                  </span>
                </div>
              </Link>
            );
          })}
        </nav>

        <Separator className="bg-sidebar-border" />
        <div className="flex items-center justify-between gap-2 px-5 py-4">
          <div className="text-xs">
            <p className="font-medium text-sidebar-foreground">
              {ownerName ?? "Owner"}
            </p>
            <p className="text-muted-foreground">
              Terhubung dengan agent Liana
            </p>
          </div>
          <form action={signOutAction}>
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              aria-label="Keluar"
              title="Keluar"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </aside>

      {/* Backdrop mobile */}
      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Tutup menu"
        />
      )}

      {/* Konten */}
      <div className="md:pl-72">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur md:px-8">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Buka menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex flex-1 items-center justify-between gap-3">
            <h1 className="text-sm font-medium text-muted-foreground">
              {currentLabel(pathname)}
            </h1>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {businessName}
            </span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}

function currentLabel(pathname: string): string {
  const match = navItems.find(
    (item) =>
      pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  return match?.label ?? "Dashboard";
}
