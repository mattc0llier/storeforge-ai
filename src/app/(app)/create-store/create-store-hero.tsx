import Image from "next/image";

import { CreateStoreForm } from "./create-store-form";

export function CreateStoreHero({
  initialPrompt = "",
  showShowcaseImage = false,
}: {
  initialPrompt?: string;
  showShowcaseImage?: boolean;
}) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-12rem)] w-full flex-col items-center justify-center gap-14 pb-20 pt-24 md:pb-28 md:pt-32">
      <div className="flex w-full max-w-4xl flex-col items-center gap-7">
        <div className="max-w-3xl text-center">
          <h1 className="text-3xl font-semibold tracking-normal text-foreground md:text-5xl">
            What store do you want to create?
          </h1>
        </div>

        <div className="w-full">
          <CreateStoreForm initialPrompt={initialPrompt} />
        </div>
      </div>

      {showShowcaseImage ? (
        <div className="w-full max-w-6xl">
          <Image
            alt="StoreForge autonomous commerce factory illustration"
            className="h-auto w-full rounded-xl border object-cover"
            height={461}
            priority
            sizes="(min-width: 1280px) 1152px, calc(100vw - 48px)"
            src="/storeforge-factory.png"
            width={845}
          />
        </div>
      ) : null}
    </div>
  );
}
