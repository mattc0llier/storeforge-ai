import { CreateStoreForm } from "./create-store-form";

export function CreateStoreHero() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-12rem)] w-full max-w-4xl flex-col items-center justify-center gap-7 pb-28 pt-24 md:pb-40 md:pt-32">
      <div className="max-w-3xl text-center">
        <h1 className="text-3xl font-semibold tracking-normal text-foreground md:text-5xl">
          What store do you want to create?
        </h1>
      </div>

      <div className="w-full">
        <CreateStoreForm />
      </div>
    </div>
  );
}
