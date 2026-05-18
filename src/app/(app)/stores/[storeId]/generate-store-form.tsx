"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Rocket } from "lucide-react";

import { Button } from "@/components/ui/button";

export function GenerateStoreForm({
  disabled,
  storeId,
}: {
  disabled: boolean;
  storeId: string;
}) {
  const router = useRouter();
  const [isLaunching, setIsLaunching] = useState(false);
  const statusHref = `/stores/${storeId}/status`;

  useEffect(() => {
    router.prefetch(statusHref);
  }, [router, statusHref]);

  function submitLaunch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (disabled || isLaunching) {
      return;
    }

    setIsLaunching(true);

    void fetch(`/api/stores/${storeId}/launch`, {
      cache: "no-store",
      keepalive: true,
      method: "POST",
    }).catch((error: unknown) => {
      console.error("[store-generation] launch request failed", error);
    });

    router.push(statusHref);
  }

  return (
    <form onSubmit={submitLaunch}>
      <Button
        className="w-full"
        disabled={disabled || isLaunching}
        size="lg"
        title={
          disabled
            ? "Generate product images before creating the final store."
            : undefined
        }
        type="submit"
      >
        <Rocket />
        {isLaunching ? "Opening generation" : "Generate store"}
      </Button>
    </form>
  );
}
