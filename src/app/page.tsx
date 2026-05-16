import { AppShell } from "@/components/app-shell";
import { CreateStoreHero } from "@/app/(app)/create-store/create-store-hero";

export default function HomePage() {
  return (
    <AppShell>
      <CreateStoreHero />
    </AppShell>
  );
}
