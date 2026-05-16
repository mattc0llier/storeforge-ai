import Link from "next/link";
import { Blocks } from "lucide-react";

import { Separator } from "@/components/ui/separator";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/create-store", label: "Create" },
];

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-background">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-6 md:px-10">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-lg border bg-card">
              <Blocks className="size-4" />
            </span>
            <span className="font-semibold">StoreForge AI</span>
          </Link>
          <nav className="flex items-center gap-6 text-sm font-medium">
            {navItems.map((item) => (
              <Link
                className="text-muted-foreground transition-colors hover:text-foreground"
                href={item.href}
                key={item.href}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10 md:px-10">
        {children}
      </main>
      <Separator />
      <footer className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6 text-xs text-muted-foreground md:px-10">
        <span>StoreForge AI</span>
        <span>Next.js Commerce transformation demo</span>
      </footer>
    </div>
  );
}
