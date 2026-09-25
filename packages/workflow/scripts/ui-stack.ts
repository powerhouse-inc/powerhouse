// The live stack the UI screenshots and UI tests run against: switchboard
// (workflows on, in-memory) plus Connect's Vite dev server, seeded per drive.
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { spawn, type ChildProcess, execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type * as ConnectionModel from "../document-models/connection/v1/index.js";
import type * as WorkflowModel from "../document-models/workflow/v1/index.js";

export const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = resolve(PKG, "../..");
const SWITCHBOARD_PORT = 4001;
const CONNECT_PORT = Number(process.env.UI_SHOTS_CONNECT_PORT ?? 3100);
export const SWITCHBOARD = `http://localhost:${SWITCHBOARD_PORT}`;
export const CONNECT = `http://localhost:${CONNECT_PORT}`;

// ─── servers ────────────────────────────────────────────────────────────────

const RUNTIME_URL = `${SWITCHBOARD}/graphql/workflow-runtime`;

async function isUp(url: string): Promise<boolean> {
  try {
    // The runtime subgraph registers last; a GraphQL answer means ready.
    const res =
      url === RUNTIME_URL
        ? await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: '{"query":"{ __typename }"}',
            signal: AbortSignal.timeout(2000),
          })
        : await fetch(url, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitUp(url: string, name: string, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isUp(url)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${name} did not come up at ${url}`);
}

function startServer(
  name: string,
  cmd: string,
  args: string[],
  cwd: string,
  env: Record<string, string> = {},
): ChildProcess {
  const child = spawn(cmd, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const prefix = `[${name}] `;
  const pipe = (chunk: Buffer) => {
    if (!process.env.UI_SHOTS_VERBOSE) return;
    process.stdout.write(
      chunk
        .toString()
        .split("\n")
        .map((l) => (l ? prefix + l : l))
        .join("\n"),
    );
  };
  child.stdout.on("data", pipe);
  child.stderr.on("data", pipe);
  return child;
}

/** Starts whichever of switchboard / Connect is not already listening. */
export async function ensureServers(): Promise<ChildProcess[]> {
  const started: ChildProcess[] = [];
  if (!(await isUp(RUNTIME_URL))) {
    console.log(`▶ starting switchboard on :${SWITCHBOARD_PORT}`);
    started.push(
      startServer(
        "switchboard",
        "node",
        ["dist/index.mjs"],
        join(ROOT, "apps/switchboard"),
        {
          PORT: String(SWITCHBOARD_PORT),
          PH_PGLITE_IN_MEMORY: "1",
          PH_WORKFLOWS_ENABLED: "true",
        },
      ),
    );
  }
  if (!(await isUp(CONNECT))) {
    console.log(`▶ starting Connect (vite dev) on :${CONNECT_PORT}`);
    started.push(
      startServer(
        "connect",
        "pnpm",
        ["exec", "vite", "dev", "--port", String(CONNECT_PORT), "--strictPort"],
        join(ROOT, "apps/connect"),
      ),
    );
  }
  await waitUp(RUNTIME_URL, "switchboard");
  await waitUp(CONNECT, "Connect");
  return started;
}

// Connect imports the package's dist stylesheet; regenerate it from source.
// Written only when it changed: every write makes Vite reload open pages.
export async function buildCss(): Promise<void> {
  const target = join(PKG, "dist/style.css");
  const scratch = join(PKG, ".ui-shots/style.css");
  mkdirSync(dirname(scratch), { recursive: true });
  execSync(`pnpm exec tailwindcss -i ./style.css -o ${scratch}`, {
    cwd: PKG,
    stdio: "ignore",
  });
  let css = readFileSync(scratch, "utf8");
  try {
    css += "\n" + readFileSync(join(PKG, "dist/browser/style.css"), "utf8");
  } catch {
    // No browser build yet; Connect dev loads the canvas CSS from source.
  }
  const current = existsSync(target) ? readFileSync(target, "utf8") : "";
  if (css === current) return;
  writeFileSync(target, css);
  // Let Vite pick up the change before any page loads.
  await new Promise((r) => setTimeout(r, 2000));
}

// ─── seeding ────────────────────────────────────────────────────────────────

export async function gql<T>(path: string, query: string, variables = {}) {
  const res = await fetch(`${SWITCHBOARD}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await res.json()) as {
    data?: T;
    errors?: { message: string }[];
  };
  if (body.errors?.length) throw new Error(body.errors[0].message);
  return body.data as T;
}

async function createRemoteDrive(slug: string): Promise<string> {
  const data = await gql<{ DocumentDrive: { createDocument: { id: string } } }>(
    "/graphql/document-drive",
    `mutation($slug: String!) { DocumentDrive { createDocument(name: "Workflows", slug: $slug, preferredEditor: "workflow-studio") { id } } }`,
    { slug },
  );
  return data.DocumentDrive.createDocument.id;
}

async function createSecret(value: string, label: string): Promise<string> {
  const data = await gql<{
    workflowRuntime: { createSecret: { ref: string } };
  }>(
    "/graphql/workflow-runtime",
    `mutation($v: String!, $l: String) { workflowRuntime { createSecret(value: $v, label: $l) { ref } } }`,
    { v: value, l: label },
  );
  return data.workflowRuntime.createSecret.ref;
}

async function pieceBlockType(pkg: string, action: string): Promise<string> {
  const data = await gql<{
    workflowRuntime: {
      pieceActions: { actions: { name: string; blockType: string }[] };
    };
  }>(
    "/graphql/workflow-runtime",
    `query($p: String!) { workflowRuntime { pieceActions(packageName: $p) } }`,
    { p: pkg },
  );
  const hit = data.workflowRuntime.pieceActions.actions.find(
    (a) => a.name === action,
  );
  if (!hit) throw new Error(`No action ${action} in ${pkg}`);
  return hit.blockType;
}

interface SeedInput {
  root: string;
  drive: string;
  blocks: { http: string; parseUrl: string; openai: string; slack: string };
  botTokenRef: string;
}

export interface Seeded {
  digest: string;
  smoke: string;
  ping: string;
  connection: string;
}

interface PhWindow {
  ph?: {
    reactorClientModule?: {
      client: {
        drives: {
          addFile(
            drive: string,
            doc: unknown,
          ): Promise<{ header: { id: string } }>;
        };
        execute(
          id: string,
          branch: string,
          actions: unknown[],
        ): Promise<unknown>;
        rename(id: string, name: string): Promise<unknown>;
        get(id: string): Promise<unknown>;
      };
    };
  };
}

/** Creates the documents through Connect's reactor, which syncs them up. */
function seedInBrowser(page: Page, input: SeedInput): Promise<Seeded> {
  return page.evaluate(async ({ root, drive, blocks, botTokenRef }) => {
    const w = window as unknown as PhWindow;
    const client = w.ph!.reactorClientModule!.client;
    // Served by Connect's Vite dev server straight from source.
    const wf = (await import(
      `/@fs${root}/packages/workflow/document-models/workflow/v1/index.ts`
    )) as typeof WorkflowModel;
    const cn = (await import(
      `/@fs${root}/packages/workflow/document-models/connection/v1/index.ts`
    )) as typeof ConnectionModel;

    // The drive can be readable before it accepts files, so the first add
    // retries; inline because tsx wraps named functions in a missing __name.
    let conn: { header: { id: string } } | undefined;
    for (let attempt = 0; !conn; attempt++) {
      try {
        conn = await client.drives.addFile(drive, cn.utils.createDocument());
      } catch (error) {
        if (attempt >= 30) throw error;
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    const connection = conn.header.id;
    await client.execute(connection, "main", [
      cn.setConnectionName({ name: "Ops Slack" }),
      cn.setConnector({
        connectorId: "@activepieces/piece-slack",
        authType: "CUSTOM_AUTH",
      }),
      cn.setSecretRef({ id: "bot-token", name: "botToken", ref: botTokenRef }),
      cn.setAccountLabel({ accountLabel: "ops@acme.dev" }),
      cn.recordCheckResult({
        status: "OK",
        checkedAt: new Date().toISOString(),
      }),
    ]);
    await client.rename(connection, "Ops Slack");

    const digestDoc = await client.drives.addFile(
      drive,
      wf.utils.createDocument(),
    );
    const digest = digestDoc.header.id;
    await client.execute(digest, "main", [
      wf.setWorkflowName({ name: "Daily digest" }),
      wf.setWorkflowDescription({
        description:
          "Fetch overnight metrics, summarise them and post to #ops.",
      }),
      wf.setTrigger({
        id: "trigger",
        blockType: "core#schedule",
        config: { cron: "0 8 * * *" },
      }),
      wf.addStep({
        id: "fetch",
        key: "fetch",
        name: "Fetch metrics",
        blockType: blocks.http,
        config: { method: "GET", url: "https://metrics.acme.dev/overnight" },
      }),
      wf.addStep({
        id: "summarise",
        key: "summarise",
        name: "Summarise",
        blockType: blocks.openai,
        config: { prompt: "Summarise {{fetch.body}} in three bullets." },
      }),
      wf.addStep({
        id: "post",
        key: "post",
        name: "Post to #ops",
        blockType: blocks.slack,
        connectionId: connection,
        config: { channel: "#ops", text: "{{summarise.output}}" },
      }),
      wf.addEdge({ id: "e1", from: "trigger", to: "fetch", port: "next" }),
      wf.addEdge({ id: "e2", from: "fetch", to: "summarise", port: "next" }),
      wf.addEdge({ id: "e3", from: "summarise", to: "post", port: "next" }),
      wf.setVariable({
        id: "v1",
        key: "channel",
        value: "#ops",
        description: "Where the digest goes",
      }),
      wf.setWorkflowStatus({ status: "ENABLED" }),
    ]);
    await client.rename(digest, "Daily digest");

    const smokeDoc = await client.drives.addFile(
      drive,
      wf.utils.createDocument(),
    );
    const smoke = smokeDoc.header.id;
    await client.execute(smoke, "main", [
      wf.setWorkflowName({ name: "Link checker" }),
      wf.setTrigger({ id: "trigger", blockType: "core#manual", config: {} }),
      wf.addStep({
        id: "parse",
        key: "parse",
        name: "Parse URL",
        blockType: blocks.parseUrl,
        config: { url: "https://acme.dev/docs?page=2" },
      }),
      wf.addEdge({ id: "e1", from: "trigger", to: "parse", port: "next" }),
      wf.setWorkflowStatus({ status: "ENABLED" }),
    ]);
    await client.rename(smoke, "Link checker");

    const pingDoc = await client.drives.addFile(
      drive,
      wf.utils.createDocument(),
    );
    const ping = pingDoc.header.id;
    await client.execute(ping, "main", [
      wf.setWorkflowName({ name: "Uptime ping" }),
      wf.setTrigger({ id: "trigger", blockType: "core#manual", config: {} }),
      wf.addStep({
        id: "parse",
        key: "parse",
        name: "Parse URL",
        blockType: blocks.parseUrl,
        config: { url: "https://status.acme.dev/health" },
      }),
      wf.addStep({
        id: "ping",
        key: "ping",
        name: "Ping host",
        blockType: blocks.http,
        config: { method: "GET", url: "http://127.0.0.1:9/health" },
      }),
      wf.addStep({
        id: "alert",
        key: "alert",
        name: "Alert #ops",
        blockType: blocks.slack,
        connectionId: connection,
        config: { channel: "#ops", text: "Host down: {{parse.hostname}}" },
      }),
      wf.addEdge({ id: "e1", from: "trigger", to: "parse", port: "next" }),
      wf.addEdge({ id: "e2", from: "parse", to: "ping", port: "next" }),
      wf.addEdge({ id: "e3", from: "ping", to: "alert", port: "next" }),
      wf.setWorkflowStatus({ status: "ENABLED" }),
    ]);
    await client.rename(ping, "Uptime ping");

    return { digest, smoke, ping, connection };
  }, input);
}

/** Fires a manual workflow once it has synced to the switchboard. */
export async function fireWhenSynced(workflowId: string, payload?: unknown) {
  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      return await gql(
        "/graphql/workflow-runtime",
        `mutation($id: String!, $payload: Unknown) { workflowRuntime { fire(workflowId: $id, payload: $payload) { runId status } } }`,
        { id: workflowId, payload: payload ?? null },
      );
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

// ─── a seeded Connect page ───────────────────────────────────────────────────

export interface SeededPage {
  context: BrowserContext;
  page: Page;
  seeded: Seeded;
}

/** A fresh browser context on a new remote drive holding the demo documents. */
export async function openSeededPage(
  browser: Browser,
  options: {
    colorScheme?: "light" | "dark";
    viewport?: { width: number; height: number };
  } = {},
): Promise<SeededPage> {
  const driveSlug = `ui-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const drive = await createRemoteDrive(driveSlug);
  const blocks = {
    http: await pieceBlockType("@activepieces/piece-http", "send_request"),
    parseUrl: await pieceBlockType("@activepieces/piece-http", "parse_url"),
    openai: await pieceBlockType("@activepieces/piece-openai", "ask_chatgpt"),
    slack: await pieceBlockType(
      "@activepieces/piece-slack",
      "send_channel_message",
    ),
  };

  const context = await browser.newContext({
    viewport: options.viewport ?? { width: 1440, height: 900 },
    colorScheme: options.colorScheme ?? "light",
  });
  await context.route("**/powerhouse.config.json", async (route) => {
    const response = await route.fetch();
    const config = (await response.json()) as {
      connect: { app?: object; drives: { defaultDrives: unknown[] } };
    };
    config.connect.app = { ...config.connect.app, workflowsEnabled: true };
    config.connect.drives.defaultDrives = [
      { url: `${CONNECT}/d/${driveSlug}`, name: "Workflows" },
    ];
    await route.fulfill({ response, json: config });
  });

  const page = await context.newPage();
  await page.goto(CONNECT);
  const accept = page.getByRole("button", {
    name: "Accept configured cookies",
  });
  await accept.click({ timeout: 15_000 }).catch(() => {});
  // The drive document has synced once the local reactor can read it.
  await page.waitForFunction(
    async (id) => {
      const client = (window as unknown as PhWindow).ph?.reactorClientModule
        ?.client;
      return !!(await client?.get(id).catch(() => null));
    },
    drive,
    { timeout: 60_000, polling: 500 },
  );

  const botTokenRef = await createSecret(
    "xoxb-demo-token",
    "Ops Slack · Bot Token",
  );
  const seeded = await seedInBrowser(page, {
    root: ROOT,
    drive,
    blocks,
    botTokenRef,
  });
  // One succeeded and one failed run, for the runs views.
  await fireWhenSynced(seeded.smoke);
  await fireWhenSynced(seeded.ping, { url: "https://status.acme.dev/health" });
  return { context, page, seeded };
}

// ─── navigation ─────────────────────────────────────────────────────────────

export async function openDrive(page: Page) {
  await page.getByText("Workflows", { exact: true }).first().click();
  await page.getByRole("heading", { name: "Workflows", level: 2 }).waitFor();
}

export async function selectInSidebar(page: Page, name: string) {
  await page.getByText(name, { exact: true }).first().click();
}

export async function openWorkflowEditor(page: Page, name = "Daily digest") {
  await openDrive(page);
  await selectInSidebar(page, name);
  await page.getByRole("button", { name: "Edit workflow" }).click();
  await page.locator(".react-flow__node").first().waitFor();
}

export function canvasNode(page: Page, text: string) {
  return page.locator(".react-flow__node", { hasText: text }).first();
}
