"use client";

import { SignOutButton } from "@clerk/nextjs";

export function DashboardLogoutLink() {
  return (
    <SignOutButton redirectUrl="/">
      <button
        className="text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        type="button"
      >
        Log out
      </button>
    </SignOutButton>
  );
}
