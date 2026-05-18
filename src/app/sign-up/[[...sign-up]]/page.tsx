import { SignUp } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";

import { storeForgeClerkAppearance } from "@/lib/auth/clerk-appearance";

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen flex-col bg-background">
      <header className="mx-auto flex h-16 w-full max-w-7xl items-center px-6 md:px-10">
        <Link className="flex items-center gap-2" href="/">
          <span className="flex size-9 items-center justify-center">
            <Image
              alt=""
              aria-hidden="true"
              className="h-8 w-auto"
              height={83}
              priority
              src="/storeforge.svg"
              width={71}
            />
          </span>
          <span className="font-semibold">StoreForge</span>
        </Link>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
        <div className="max-w-xl space-y-3 text-center">
          <h1 className="text-4xl font-semibold tracking-normal text-foreground md:text-5xl">
            Create your StoreForge account
          </h1>
          <p className="text-base leading-7 text-muted-foreground">
            Use your Vercel login to keep generated storefronts, repositories,
            and deployments connected.
          </p>
        </div>
        <SignUp
          appearance={storeForgeClerkAppearance}
          signInUrl="/sign-in"
        />
      </div>
    </main>
  );
}
