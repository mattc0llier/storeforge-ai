import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  createStoreForgeCodexClient,
  startWorkspaceThread,
  streamCodexTurn,
} from "../lib/codex/client";

const MARKER = "codex-sdk-spike-success";
const UPDATED_HEADING = "Codex SDK workspace edit verified";

async function main() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "storeforge-codex-"));
  const sourceDir = path.join(workspace, "src");
  const targetFile = path.join(sourceDir, "SampleCard.tsx");

  await mkdir(sourceDir, { recursive: true });
  await writeFile(targetFile, initialSampleFile(), "utf8");

  const codex = createStoreForgeCodexClient({
    apiKey: process.env.CODEX_API_KEY,
    baseUrl: process.env.CODEX_BASE_URL,
  });
  const thread = startWorkspaceThread(codex, {
    workingDirectory: workspace,
    model: process.env.CODEX_MODEL,
    skipGitRepoCheck: true,
  });

  const prompt = [
    "Modify src/SampleCard.tsx.",
    `Change the visible heading text to exactly: ${UPDATED_HEADING}`,
    `Add this exported constant exactly: export const CODEX_SPIKE_MARKER = "${MARKER}";`,
    "Keep the file valid TypeScript/React TSX.",
    "Do not create or edit any other files.",
  ].join("\n");

  const startedAt = Date.now();

  try {
    console.log(`[spike] workspace=${workspace}`);
    console.log(`[spike] target=${targetFile}`);
    console.log("[spike] starting Codex SDK streamed turn");

    const turn = await streamCodexTurn(thread, prompt);
    const updated = await readFile(targetFile, "utf8");
    const success =
      updated.includes(MARKER) &&
      updated.includes(UPDATED_HEADING) &&
      !updated.includes("Original StoreForge card");

    if (!success) {
      console.log("[spike] failure: target file did not contain expected edits");
      console.log(
        JSON.stringify(
          {
            success,
            workspace,
            targetFile,
            threadId: turn.threadId,
            eventCount: turn.events.length,
            durationMs: Date.now() - startedAt,
            markerFound: updated.includes(MARKER),
            headingFound: updated.includes(UPDATED_HEADING),
          },
          null,
          2,
        ),
      );
      process.exitCode = 1;
      return;
    }

    console.log(
      JSON.stringify(
        {
          success,
          workspace,
          targetFile,
          threadId: turn.threadId,
          eventCount: turn.events.length,
          durationMs: Date.now() - startedAt,
          finalResponseChars: turn.finalResponse.length,
          usage: turn.usage,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error("[spike] failure");
    console.error(error instanceof Error ? error.message : error);
    console.error(
      JSON.stringify(
        {
          success: false,
          workspace,
          targetFile,
          durationMs: Date.now() - startedAt,
          hasCodexApiKey: Boolean(process.env.CODEX_API_KEY),
          hint: "Set CODEX_API_KEY or ensure the Codex CLI is authenticated.",
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  }
}

function initialSampleFile() {
  return `import type { ReactNode } from "react";

export interface SampleCardProps {
  eyebrow: string;
  children: ReactNode;
}

export function SampleCard({ eyebrow, children }: SampleCardProps) {
  return (
    <section>
      <p>{eyebrow}</p>
      <h1>Original StoreForge card</h1>
      <div>{children}</div>
    </section>
  );
}
`;
}

void main();
