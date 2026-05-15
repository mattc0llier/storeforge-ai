import { existsSync } from "node:fs";
import path from "node:path";

import {
  Codex,
  type CodexOptions,
  type Thread,
  type ThreadEvent,
  type ThreadOptions,
  type Usage,
} from "@openai/codex-sdk";

export interface StoreForgeCodexClientOptions {
  apiKey?: string;
  baseUrl?: string;
  codexPathOverride?: string;
  env?: Record<string, string>;
}

export interface StartWorkspaceThreadOptions {
  workingDirectory: string;
  model?: string;
  skipGitRepoCheck?: boolean;
}

export interface StreamCodexTurnOptions {
  logger?: (line: string) => void;
}

export interface StreamCodexTurnResult {
  events: ThreadEvent[];
  finalResponse: string;
  threadId: string | null;
  usage: Usage | null;
}

export function createStoreForgeCodexClient(
  options: StoreForgeCodexClientOptions = {},
) {
  const codexOptions: CodexOptions = {};

  if (options.apiKey) {
    codexOptions.apiKey = options.apiKey;
  }

  if (options.baseUrl) {
    codexOptions.baseUrl = options.baseUrl;
  }

  if (options.env) {
    codexOptions.env = options.env;
  }

  const codexPathOverride =
    options.codexPathOverride ??
    process.env.CODEX_CLI_PATH ??
    resolveBundledCodexBinary();

  if (codexPathOverride) {
    codexOptions.codexPathOverride = codexPathOverride;
  }

  // TODO: Add generation-scoped config overrides for production repository runs.
  return new Codex(codexOptions);
}

export function startWorkspaceThread(
  codex: Codex,
  options: StartWorkspaceThreadOptions,
): Thread {
  const threadOptions: ThreadOptions = {
    workingDirectory: options.workingDirectory,
    skipGitRepoCheck: options.skipGitRepoCheck ?? true,
    sandboxMode: "workspace-write",
    approvalPolicy: "never",
  };

  if (options.model) {
    threadOptions.model = options.model;
  }

  // TODO: Thread options should eventually be persisted with generation runs.
  return codex.startThread(threadOptions);
}

export async function streamCodexTurn(
  thread: Thread,
  prompt: string,
  options: StreamCodexTurnOptions = {},
): Promise<StreamCodexTurnResult> {
  const logger = options.logger ?? console.log;
  const events: ThreadEvent[] = [];
  let finalResponse = "";
  let usage: Usage | null = null;

  const { events: stream } = await thread.runStreamed(prompt);

  for await (const event of stream) {
    events.push(event);
    logCodexEvent(event, logger);

    if (event.type === "item.completed" && event.item.type === "agent_message") {
      finalResponse = event.item.text;
    }

    if (event.type === "turn.completed") {
      usage = event.usage;
    }

    if (event.type === "turn.failed") {
      throw new Error(event.error.message);
    }

    if (event.type === "error") {
      throw new Error(event.message);
    }
  }

  return {
    events,
    finalResponse,
    threadId: thread.id,
    usage,
  };
}

export function logCodexEvent(
  event: ThreadEvent,
  logger: (line: string) => void = console.log,
) {
  switch (event.type) {
    case "thread.started":
      logger(`[codex] thread.started ${event.thread_id}`);
      break;
    case "turn.started":
      logger("[codex] turn.started");
      break;
    case "turn.completed":
      logger(
        `[codex] turn.completed input=${event.usage.input_tokens} output=${event.usage.output_tokens}`,
      );
      break;
    case "turn.failed":
      logger(`[codex] turn.failed ${event.error.message}`);
      break;
    case "error":
      logger(`[codex] error ${event.message}`);
      break;
    case "item.started":
    case "item.updated":
    case "item.completed":
      logger(formatThreadItemEvent(event));
      break;
  }
}

function formatThreadItemEvent(
  event: Extract<
    ThreadEvent,
    { type: "item.started" | "item.updated" | "item.completed" }
  >,
) {
  const item = event.item;

  if (item.type === "command_execution") {
    return `[codex] ${event.type} command_execution status=${item.status} command=${item.command}`;
  }

  if (item.type === "file_change") {
    const changes = item.changes
      .map((change) => `${change.kind}:${change.path}`)
      .join(",");

    return `[codex] ${event.type} file_change status=${item.status} changes=${changes}`;
  }

  if (item.type === "agent_message") {
    return `[codex] ${event.type} agent_message chars=${item.text.length}`;
  }

  if (item.type === "reasoning") {
    return `[codex] ${event.type} reasoning chars=${item.text.length}`;
  }

  if (item.type === "todo_list") {
    const completed = item.items.filter((todo) => todo.completed).length;
    return `[codex] ${event.type} todo_list ${completed}/${item.items.length}`;
  }

  if (item.type === "mcp_tool_call") {
    return `[codex] ${event.type} mcp_tool_call ${item.server}.${item.tool} status=${item.status}`;
  }

  if (item.type === "web_search") {
    return `[codex] ${event.type} web_search query=${item.query}`;
  }

  if (item.type === "error") {
    return `[codex] ${event.type} error ${item.message}`;
  }

  return assertNever(item);
}

function assertNever(value: never): string {
  void value;
  return "[codex] unknown item";
}

function resolveBundledCodexBinary() {
  const target = getCodexBinaryTarget();

  if (!target) {
    return null;
  }

  const binaryPath = path.join(
    process.cwd(),
    "node_modules",
    "@openai",
    target.packageName,
    "vendor",
    target.triple,
    "codex",
    process.platform === "win32" ? "codex.exe" : "codex",
  );

  return existsSync(binaryPath) ? binaryPath : null;
}

function getCodexBinaryTarget() {
  if (process.platform === "darwin" && process.arch === "arm64") {
    return {
      packageName: "codex-darwin-arm64",
      triple: "aarch64-apple-darwin",
    };
  }

  if (process.platform === "darwin" && process.arch === "x64") {
    return {
      packageName: "codex-darwin-x64",
      triple: "x86_64-apple-darwin",
    };
  }

  if (process.platform === "linux" && process.arch === "arm64") {
    return {
      packageName: "codex-linux-arm64",
      triple: "aarch64-unknown-linux-musl",
    };
  }

  if (process.platform === "linux" && process.arch === "x64") {
    return {
      packageName: "codex-linux-x64",
      triple: "x86_64-unknown-linux-musl",
    };
  }

  if (process.platform === "win32" && process.arch === "arm64") {
    return {
      packageName: "codex-win32-arm64",
      triple: "aarch64-pc-windows-msvc",
    };
  }

  if (process.platform === "win32" && process.arch === "x64") {
    return {
      packageName: "codex-win32-x64",
      triple: "x86_64-pc-windows-msvc",
    };
  }

  return null;
}
