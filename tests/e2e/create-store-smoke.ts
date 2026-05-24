import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const authStatePath = process.env.AGENT_BROWSER_STATE;
const baseUrl = process.env.AGENT_BROWSER_BASE_URL ?? "http://localhost:3001";
const session =
  process.env.AGENT_BROWSER_SESSION ??
  `storeforge-create-store-smoke-${Date.now()}`;
const prompt =
  process.env.STOREFORGE_E2E_PROMPT ??
  "A compact coffee gear store for remote workers with three focused products.";

if (!authStatePath) {
  console.log(
    "Skipping agent-browser smoke test. Set AGENT_BROWSER_STATE=agent-browser/.auth/user.json to run it.",
  );
  process.exit(0);
}

if (!existsSync(authStatePath)) {
  console.log(
    `Skipping agent-browser smoke test. Auth state file was not found at ${authStatePath}.`,
  );
  process.exit(0);
}

function agentBrowser(args: string[], options?: { capture?: boolean }) {
  const output = execFileSync(
    "npx",
    ["agent-browser", "--session", session, ...args],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        AGENT_BROWSER_STATE: authStatePath,
      },
      stdio: options?.capture ? "pipe" : "inherit",
    },
  );

  return output ?? "";
}

function assertTextIncludes(
  label: string,
  text: string,
  expected: string | RegExp,
) {
  const matches =
    typeof expected === "string" ? text.includes(expected) : expected.test(text);

  if (!matches) {
    throw new Error(
      `${label} did not include ${expected.toString()}.\n\nReceived:\n${text.slice(
        0,
        1000,
      )}`,
    );
  }
}

try {
  agentBrowser(["state", "load", authStatePath]);
  agentBrowser(["open", baseUrl]);
  agentBrowser(["wait", "--load", "networkidle"]);
  agentBrowser([
    "find",
    "role",
    "textbox",
    "fill",
    prompt,
    "--name",
    "Store idea",
  ]);
  agentBrowser([
    "find",
    "role",
    "button",
    "click",
    "--name",
    "Generate blueprint",
  ]);
  agentBrowser(["wait", "--url", "**/stores/**"]);

  const blueprintUrl = agentBrowser(["eval", "window.location.href"], {
    capture: true,
  }).trim();

  if (!/\/stores\/[^/]+$/i.test(blueprintUrl)) {
    throw new Error(`Expected to land on a blueprint page, got ${blueprintUrl}`);
  }

  const blueprintText = agentBrowser(["eval", "document.body.innerText"], {
    capture: true,
  });

  assertTextIncludes("Blueprint page", blueprintText, /Store ID:/i);
  assertTextIncludes(
    "Blueprint page",
    blueprintText,
    /Launch Catalog|Products are being generated|Ready to generate the store/i,
  );

  agentBrowser(["open", `${blueprintUrl.replace(/\/$/, "")}/status`]);
  agentBrowser(["wait", "--load", "networkidle"]);

  const statusText = agentBrowser(["eval", "document.body.innerText"], {
    capture: true,
  });

  assertTextIncludes("Status page", statusText, "Generation");
  assertTextIncludes(
    "Status page",
    statusText,
    /Live sandbox preview|Production store/i,
  );
} finally {
  try {
    agentBrowser(["close"]);
  } catch {
    // Best effort cleanup only.
  }
}
