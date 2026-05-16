"use client";

import { useActionState, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ArrowUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import {
  createStoreAction,
  type CreateStoreActionState,
} from "./actions";

const initialState: CreateStoreActionState = {};

const examplePrompts = [
  {
    label: "Premium matcha kits",
    prompt: "A premium matcha store with three ritual kits for busy creative teams.",
  },
  {
    label: "Design-led dog accessories",
    prompt:
      "A design-forward dog accessories shop with four durable walking essentials.",
  },
  {
    label: "Weekend hiking gear",
    prompt:
      "A compact outdoor gear storefront with three lightweight products for weekend hikers.",
  },
];

export function CreateStoreForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState(
    createStoreAction,
    initialState,
  );
  const [prompt, setPrompt] = useState("");

  function submitExamplePrompt(example: string) {
    flushSync(() => {
      setPrompt(example);
    });
    formRef.current?.requestSubmit();
  }

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-4" ref={formRef}>
        <div className="relative overflow-hidden rounded-[1.75rem] border border-input/70 bg-background shadow-[0_18px_70px_rgba(0,0,0,0.09),0_2px_6px_rgba(0,0,0,0.08)] transition-shadow focus-within:border-foreground/35 focus-within:shadow-[0_22px_80px_rgba(0,0,0,0.11),0_2px_8px_rgba(0,0,0,0.09)]">
          <Textarea
            aria-label="Store idea"
            id="prompt"
            name="prompt"
            placeholder="Describe the store you want to launch"
            rows={6}
            required
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            className="min-h-32 resize-none rounded-none border-0 px-6 py-6 pr-20 text-lg leading-7 shadow-none placeholder:text-muted-foreground/80 focus-visible:ring-0 md:min-h-36 md:px-7 md:py-7 md:text-xl"
          />
          <Button
            aria-label="Generate blueprint"
            className="absolute bottom-4 right-4 size-11 rounded-full bg-muted p-0 text-muted-foreground shadow-none hover:bg-primary hover:text-primary-foreground disabled:bg-muted disabled:text-muted-foreground md:bottom-5 md:right-5"
            disabled={isPending}
            type="submit"
            variant="secondary"
          >
            <ArrowUp className="size-5" />
          </Button>
        </div>

        {state.error ? (
          <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
      </form>

      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-2.5">
        <span className="text-sm text-muted-foreground">Try</span>
        {examplePrompts.map((example) => (
          <button
            className="h-10 rounded-full border border-border bg-background px-4 text-sm font-medium text-muted-foreground shadow-sm transition-colors hover:border-foreground/25 hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
            key={example.label}
            onClick={() => submitExamplePrompt(example.prompt)}
            type="button"
          >
            {example.label}
          </button>
        ))}
      </div>
    </div>
  );
}
