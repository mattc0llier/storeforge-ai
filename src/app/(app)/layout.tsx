import { AppShell } from "@/components/app-shell";

export default function StoreForgeAppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <AppShell>{children}</AppShell>;
}
