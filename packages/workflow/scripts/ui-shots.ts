// Screenshots of the workflow editors running in Connect against a live
// switchboard. Usage: README.md, "UI screenshots".
import { chromium, type Page } from "@playwright/test";
import { spawn, type ChildProcess, execSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import type * as ConnectionModel from "../document-models/connection/v1/index.js";
import type * as WorkflowModel from "../document-models/workflow/v1/index.js";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = resolve(PKG, "../..");
const SWITCHBOARD_PORT = 4001;
const CONNECT_PORT = Number(process.env.UI_SHOTS_CONNECT_PORT ?? 3100);
const SWITCHBOARD = `http://localhost:${SWITCHBOARD_PORT}`;
const CONNECT = `http://localhost:${CONNECT_PORT}`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: "string", default: join(PKG, ".ui-shots") },
    theme: { type: "string", default: "light" },
    width: { type: "string", default: "1440" },
    height: { type: "string", default: "900" },
    list: { type: "boolean", default: false },
    serve: { type: "boolean", default: false },
  },
});

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
async function ensureServers(): Promise<ChildProcess[]> {
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

/** Connect imports the package's dist stylesheet; regenerate it from source. */
function buildCss() {
  execSync("pnpm exec tailwindcss -i ./style.css -o ./dist/style.css", {
    cwd: PKG,
    stdio: "ignore",
  });
  const canvasCss = join(PKG, "dist/browser/style.css");
  try {
    appendFileSync(
      join(PKG, "dist/style.css"),
      "\n" + readFileSync(canvasCss, "utf8"),
    );
  } catch {
    // No browser build yet; Connect dev loads the canvas CSS from source.
  }
}

// ─── seeding ────────────────────────────────────────────────────────────────

async function gql<T>(path: string, query: string, variables = {}) {
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
  return page.evaluate(async ({ root, drive, blocks }) => {
    const w = window as unknown as PhWindow;
    const client = w.ph!.reactorClientModule!.client;
    // Served by Connect's Vite dev server straight from source.
    const wf = (await import(
      `/@fs${root}/packages/workflow/document-models/workflow/v1/index.ts`
    )) as typeof WorkflowModel;
    const cn = (await import(
      `/@fs${root}/packages/workflow/document-models/connection/v1/index.ts`
    )) as typeof ConnectionModel;

    const conn = await client.drives.addFile(drive, cn.utils.createDocument());
    const connection = conn.header.id;
    await client.execute(connection, "main", [
      cn.setConnectionName({ name: "Ops Slack" }),
      cn.setConnector({
        connectorId: "@activepieces/piece-slack",
        authType: "OAUTH2",
      }),
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
async function fireWhenSynced(workflowId: string, payload?: unknown) {
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

// ─── scenes ─────────────────────────────────────────────────────────────────

interface SceneContext {
  page: Page;
  seeded: Seeded;
}

async function openDrive({ page }: SceneContext) {
  await page.getByText("Workflows", { exact: true }).first().click();
  await page.getByText("All runs").first().waitFor();
}

async function selectInSidebar(page: Page, name: string) {
  await page.getByText(name, { exact: true }).first().click();
}

const SCENES: Record<string, (ctx: SceneContext) => Promise<void>> = {
  "studio-runs": async (ctx) => {
    await openDrive(ctx);
  },
  "studio-workflow": async (ctx) => {
    await openDrive(ctx);
    await selectInSidebar(ctx.page, "Daily digest");
  },
  "studio-run-detail": async (ctx) => {
    await openDrive(ctx);
    await ctx.page.getByText("Failed", { exact: true }).last().click();
  },
  "studio-workflow-failed": async (ctx) => {
    await openDrive(ctx);
    await selectInSidebar(ctx.page, "Uptime ping");
    await ctx.page.getByText("Failed", { exact: true }).last().click();
    await ctx.page.getByText("Started by hand").click();
  },
  "studio-connection": async (ctx) => {
    await openDrive(ctx);
    await selectInSidebar(ctx.page, "Ops Slack");
  },
  "workflow-editor": async (ctx) => {
    await openWorkflowEditor(ctx);
  },
  "workflow-editor-step": async (ctx) => {
    await openWorkflowEditor(ctx);
    await ctx.page
      .locator(".react-flow__node", { hasText: "Summarise" })
      .click();
  },
  "workflow-editor-trigger": async (ctx) => {
    await openWorkflowEditor(ctx);
    await ctx.page
      .locator(".react-flow__node", { hasText: "Schedule" })
      .first()
      .click();
  },
  "workflow-editor-select": async (ctx) => {
    await openWorkflowEditor(ctx);
    await ctx.page
      .locator(".react-flow__node", { hasText: "Summarise" })
      .click();
    await ctx.page.getByRole("combobox").filter({ hasText: "gpt" }).click();
    await ctx.page.getByRole("listbox").waitFor();
  },
  "workflow-editor-settings": async (ctx) => {
    await openWorkflowEditor(ctx);
    await ctx.page
      .locator(".react-flow__node", { hasText: "Summarise" })
      .click();
    await ctx.page.getByRole("tab", { name: "Settings" }).click();
  },
  "connection-editor": async (ctx) => {
    await openDrive(ctx);
    await selectInSidebar(ctx.page, "Ops Slack");
    await ctx.page.getByRole("button", { name: "Edit connection" }).click();
  },
};

async function openWorkflowEditor(ctx: SceneContext) {
  await openDrive(ctx);
  await selectInSidebar(ctx.page, "Daily digest");
  await ctx.page.getByRole("button", { name: "Edit workflow" }).click();
  await ctx.page.locator(".react-flow__node").first().waitFor();
}

// ─── main ───────────────────────────────────────────────────────────────────

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(600);
}

async function main() {
  if (values.list) {
    console.log(Object.keys(SCENES).join("\n"));
    return;
  }
  if (values.serve) {
    const started = await ensureServers();
    console.log(
      `Connect ${CONNECT} · switchboard ${SWITCHBOARD} — Ctrl-C to stop`,
    );
    const stop = () => {
      for (const child of started) child.kill();
      process.exit(0);
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    await new Promise(() => {});
  }
  const wanted = positionals.length ? positionals : Object.keys(SCENES);
  for (const name of wanted) {
    if (!(name in SCENES))
      throw new Error(`Unknown scene "${name}" (see --list)`);
  }

  buildCss();
  const started = await ensureServers();
  const browser = await chromium.launch();
  try {
    const driveSlug = `ui-shots-${Date.now()}`;
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
      viewport: { width: Number(values.width), height: Number(values.height) },
      colorScheme: values.theme === "dark" ? "dark" : "light",
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
    page.on("pageerror", (e) => console.warn(`  [pageerror] ${e.message}`));
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

    const seeded = await seedInBrowser(page, { root: ROOT, drive, blocks });
    // One succeeded and one failed run, for the runs views.
    await fireWhenSynced(seeded.smoke);
    await fireWhenSynced(seeded.ping, {
      url: "https://status.acme.dev/health",
    });

    mkdirSync(values.out, { recursive: true });
    const suffix = values.theme === "dark" ? "-dark" : "";
    for (const name of wanted) {
      await page.goto(CONNECT);
      await SCENES[name]({ page, seeded });
      await settle(page);
      const file = join(values.out, `${name}${suffix}.png`);
      await page.screenshot({ path: file });
      console.log(`✓ ${file}`);
    }
  } finally {
    await browser.close();
    for (const child of started) child.kill();
  }
}

await main();
