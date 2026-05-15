"use client";

import { useActionState, useState } from "react";
import { ArrowRight, Sparkles, WandSparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import {
  createStoreAction,
  type CreateStoreActionState,
} from "./actions";

const initialState: CreateStoreActionState = {};

const examplePrompts = [
  "A premium matcha store with three ritual kits for busy creative teams.",
  "A design-forward dog accessories shop with four durable walking essentials.",
  "A compact outdoor gear storefront with three lightweight products for weekend hikers.",
];

export function CreateStoreForm() {
  const [state, formAction, isPending] = useActionState(
    createStoreAction,
    initialState,
  );
  const [prompt, setPrompt] = useState("");

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="prompt">
          Store idea
        </label>
        <Textarea
          id="prompt"
          name="prompt"
          placeholder="A premium matcha store with three ritual kits for busy creative teams."
          rows={7}
          required
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          className="resize-none text-base leading-7"
        />
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium">Example prompts</p>
        <div className="grid gap-3">
          {examplePrompts.map((example) => (
            <button
              className="rounded-md border bg-background px-4 py-3 text-left text-sm leading-6 text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
              key={example}
              onClick={() => setPrompt(example)}
              type="button"
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground sm:grid-cols-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-foreground" />
          Brand system
        </div>
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-foreground" />
          1-7 products
        </div>
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-foreground" />
          Approval gate
        </div>
      </div>

      {state.error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button disabled={isPending} size="lg" type="submit">
          <WandSparkles />
          {isPending ? "Forging blueprint" : "Generate blueprint"}
          <ArrowRight />
        </Button>
        <p className="text-xs text-muted-foreground">
          No repository transform starts until you approve the blueprint.
        </p>
      </div>
    </form>
  );
}
