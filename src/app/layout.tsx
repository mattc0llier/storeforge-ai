import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export const metadata: Metadata = {
  title: "StoreForge AI",
  description: "Autonomous ecommerce storefront generation.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const document = (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );

  if (!clerkPublishableKey) {
    return document;
  }

  return (
    <ClerkProvider publishableKey={clerkPublishableKey}>
      {document}
    </ClerkProvider>
  );
}
