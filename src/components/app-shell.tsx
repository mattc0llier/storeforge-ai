import Link from "next/link";
import { Blocks, LayoutDashboard, Plus, Rocket } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/create-store", label: "Create", icon: Plus },
  { href: "/store-status", label: "Status", icon: Rocket },
];

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-md border bg-card">
              <Blocks className="size-4" />
            </span>
            <span className="font-semibold">StoreForge AI</span>
            <Badge variant="outline" className="hidden sm:inline-flex">
              scaffold
            </Badge>
          </Link>
          <nav className="flex items-center gap-1">
            {navItems.map((item) => (
              <Button key={item.href} variant="ghost" size="sm" asChild>
                <Link href={item.href}>
                  <item.icon />
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              </Button>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {children}
      </main>
      <Separator />
      <footer className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 text-xs text-muted-foreground">
        <span>StoreForge AI</span>
        <span>Next.js Commerce transformation demo</span>
      </footer>
    </div>
  );
}
