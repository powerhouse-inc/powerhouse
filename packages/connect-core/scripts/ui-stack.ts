// The Connect the UI screenshots run against: a test project's build, served
// with core's views on and seeded drives in each browser context.
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { execSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const ROOT = resolve(PKG, "../..");
const CONNECT_PORT = Number(process.env.UI_SHOTS_CONNECT_PORT ?? 4350);
if (!(CONNECT_PORT >= 4350 && CONNECT_PORT <= 4359)) {
  throw new Error(`UI_SHOTS_CONNECT_PORT must be in 4350-4359`);
}
export const CONNECT = `http://localhost:${CONNECT_PORT}`;

// Connect's production build by default; UI_CONNECT_DEV=1 runs the studio
// (Vite's dev server) instead, which serves core from source with HMR.
export function connectDev(): boolean {
  return process.env.UI_CONNECT_DEV === "1";
}

// A project with editors and project routes; its own build dir, not the default.
const PROJECT = join(ROOT, "test/versioned-documents");
const OUT_DIR = ".ph/ui-shots/dist";
const CONNECT_BUILD = join(PROJECT, OUT_DIR);
const PH_CLI = join(ROOT, "clis/ph-cli/dist/cli.mjs");

// ─── servers ────────────────────────────────────────────────────────────────

async function isUp(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
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

function startServer(name: string, args: string[]): ChildProcess {
  const child = spawn("node", [PH_CLI, ...args], {
    cwd: PROJECT,
    env: process.env,
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

/** Starts Connect unless something already answers on its port. */
export async function ensureServers(): Promise<ChildProcess[]> {
  const started: ChildProcess[] = [];
  if (!(await isUp(CONNECT))) {
    const port = ["--port", String(CONNECT_PORT), "--strictPort"];
    if (connectDev()) {
      console.log(`▶ starting Connect (studio) on :${CONNECT_PORT}`);
      started.push(startServer("connect", ["connect", "studio", ...port]));
    } else {
      buildConnectIfStale();
      console.log(`▶ starting Connect (preview) on :${CONNECT_PORT}`);
      started.push(
        startServer("connect", [
          "connect",
          "preview",
          "--outDir",
          OUT_DIR,
          ...port,
        ]),
      );
    }
  }
  await waitUp(CONNECT, "Connect");
  return started;
}

/** The newest mtime under `path`, skipping node_modules and dotfiles. */
function newest(path: string): number {
  if (!existsSync(path)) return 0;
  const stat = statSync(path);
  if (!stat.isDirectory()) return stat.mtimeMs;
  let latest = stat.mtimeMs;
  for (const entry of readdirSync(path)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    latest = Math.max(latest, newest(join(path, entry)));
  }
  return latest;
}

/** Builds Connect when it is missing or older than what it is built from. */
export function buildConnectIfStale(): void {
  const built = join(CONNECT_BUILD, "index.html");
  const inputs = [
    join(PKG, "dist"),
    join(ROOT, "apps/connect/dist"),
    join(ROOT, "packages/builder-tools/dist"),
    join(PROJECT, "powerhouse.config.json"),
    join(PROJECT, "document-models"),
    join(PROJECT, "editors"),
    // The directory too: adding or removing the routes folder bumps its mtime.
    join(PROJECT, "hosts/connect"),
  ];
  const builtAt = existsSync(built) ? statSync(built).mtimeMs : 0;
  if (builtAt && inputs.every((input) => newest(input) <= builtAt)) return;
  console.log("▶ building Connect");
  execSync(`node ${PH_CLI} connect build --outDir ${OUT_DIR}`, {
    cwd: PROJECT,
    stdio: process.env.UI_SHOTS_VERBOSE ? "inherit" : "ignore",
  });
}

// ─── a seeded Connect page ──────────────────────────────────────────────────

const VIEWPORT = { width: 1440, height: 900 };

export interface Seeded {
  /** URL paths of the seeded drives and nodes, from Connect's own slugs. */
  paths: Record<
    "drive" | "folder" | "todo" | "group" | "driveApp" | "emptyDrive",
    string
  >;
}

export interface SeededPage {
  context: BrowserContext;
  page: Page;
  seeded: Seeded;
}

export interface OpenOptions {
  colorScheme?: "light" | "dark";
  // null follows the window, for a window a person resizes.
  viewport?: { width: number; height: number } | null;
  // The classic chrome, with the generic plugin, for comparison.
  generic?: boolean;
}

/** A fresh browser context whose served config turns core's views on. */
export async function openConnect(
  browser: Browser,
  options: OpenOptions = {},
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    viewport: options.viewport === undefined ? VIEWPORT : options.viewport,
    colorScheme: options.colorScheme ?? "light",
    // The build's service worker precaches the whole app.
    serviceWorkers: "block",
  });
  await routeShell(context, options.generic ? "generic" : "core");
  await context.route("**/powerhouse.config.json", async (route) => {
    const response = await route.fetch();
    const config = (await response.json()) as {
      packages?: unknown[];
      connect: { composition?: unknown[]; drives?: { defaultDrives?: [] } };
    };
    // isPluginActive reads a declared composition; [] lacks the generic plugin.
    if (options.generic) delete config.connect.composition;
    else config.connect.composition = [];
    // No registry in this stack: the project's npm packages cannot install.
    config.packages = [];
    if (config.connect.drives) config.connect.drives.defaultDrives = [];
    await route.fulfill({ response, json: config });
  });
  const page = await context.newPage();
  await page.goto(CONNECT);
  await page
    .getByRole("button", { name: "Accept configured cookies" })
    .click({ timeout: 15_000 })
    .catch(() => {});
  await waitForReactor(page);
  return { context, page };
}

type AppShell = { head: string; body: string };
type ShellTools = {
  readAppShells(root: string): Partial<Record<string, AppShell>>;
  appShellVariantOf(html: string): string | undefined;
  swapAppShell(
    html: string,
    shell: AppShell,
    base?: string,
    appName?: string,
  ): string;
  injectAppShell(
    html: string,
    shell: AppShell,
    base?: string,
    options?: { deferStyles?: boolean; appName?: string },
  ): string;
};

// builder-tools' own shell helpers; connect-core does not depend on it.
const shellTools = () =>
  import(
    pathToFileURL(join(ROOT, "packages/builder-tools/dist/index.mjs")).href
  ) as Promise<ShellTools>;

/** Serves the page with the shell this context's composition picks, as a server that knew it would. */
async function routeShell(context: BrowserContext, variant: string) {
  const tools = await shellTools();
  const shell = tools.readAppShells(PROJECT)[variant];
  if (!shell) return;
  const isPage = (url: URL) =>
    url.origin === CONNECT && !/\.\w+$/.test(url.pathname);
  await context.route(isPage, async (route) => {
    if (route.request().resourceType() !== "document") return route.fallback();
    const response = await route.fetch();
    const html = await response.text();
    const current = tools.appShellVariantOf(html);
    // Both servers title the page with the served app name.
    const appName = /<title>([^<]*)<\/title>/
      .exec(html)?.[1]
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&amp;", "&");
    let body = html;
    if (current && current !== variant) {
      body = tools.swapAppShell(html, shell, "/", appName);
    }
    // The studio injects only core's shell, and only for a declared composition.
    if (!current && variant === "core") {
      body = tools.injectAppShell(html, shell, "/", {
        deferStyles: false,
        appName,
      });
    }
    await route.fulfill({ response, body });
  });
}

function waitForReactor(page: Page) {
  return page.waitForFunction(
    () => !!(window as { ph?: { reactorClient?: unknown } }).ph?.reactorClient,
    undefined,
    { timeout: 60_000, polling: 250 },
  );
}

interface Node {
  id: string;
  name: string;
}
interface Drive {
  header: { id: string };
  state: { global: { nodes: Node[] } };
}
interface ReactorBrowser {
  addDrive(
    input: { global: { name: string } },
    preferredEditor?: string,
  ): Promise<Drive>;
  addFolder(drive: string, name: string, parent?: string): Promise<Node>;
  addDocument(
    drive: string,
    name: string,
    type: string,
    parent?: string,
  ): Promise<Node>;
  getPHStore(): {
    reactorClient: {
      get(id: string): Promise<Drive>;
      execute(id: string, branch: string, actions: unknown[]): Promise<unknown>;
    };
  };
  makeDriveSlug(drive: Drive): string;
  makeNodeSlug(node: Node): string;
}
interface Model {
  version?: number;
  documentModel: { global: { id: string } };
  actions: Record<string, (input: object) => unknown>;
}

// The build's import map resolves the bare name; the studio serves files.
const REACTOR_BROWSER = connectDev()
  ? `/@fs${ROOT}/packages/reactor-browser/dist/index.js`
  : "@powerhousedao/reactor-browser";

/** Creates the demo drives and documents through Connect's own reactor. */
function seedInBrowser(page: Page): Promise<Seeded> {
  // No named functions inside: tsx wraps them in a __name the page lacks.
  return page.evaluate(async (specifier) => {
    const rb = (await import(specifier)) as ReactorBrowser;
    const w = window as {
      ph?: {
        vetraPackageManager?: { packages: { documentModels?: Model[] }[] };
      };
    };
    const client = rb.getPHStore().reactorClient;

    const projects = await rb.addDrive({ global: { name: "Projects" } });
    const drive = projects.header.id;
    const reports = await rb.addFolder(drive, "Reports");
    await rb.addFolder(drive, "Archive");
    await rb.addFolder(drive, "2026", reports.id);
    const todo = await rb.addDocument(drive, "Sprint todos", "test/todo");
    const group = await rb.addDocument(
      drive,
      "Core team",
      "powerhouse/reactor-group",
    );
    await rb.addDocument(drive, "Release schema", "powerhouse/document-model");
    await rb.addDocument(drive, "Q3 todos", "test/todo", reports.id);
    await rb.addDocument(
      drive,
      "Reviewers",
      "powerhouse/reactor-group",
      reports.id,
    );

    // Each type's newest model: the one addDocument creates with.
    const actions: Record<string, Model["actions"]> = {};
    const models = (w.ph?.vetraPackageManager?.packages ?? [])
      .flatMap((pkg) => pkg.documentModels ?? [])
      .sort((a, b) => (a.version ?? 1) - (b.version ?? 1));
    for (const model of models) {
      actions[model.documentModel.global.id] = model.actions;
    }
    const { addTodo, editTitle } = actions["test/todo"];
    await client.execute(todo.id, "main", [
      editTitle({ title: "Sprint 42" }),
      addTodo({ id: "t1", title: "Draft the release notes", completed: true }),
      addTodo({ id: "t2", title: "Review core's views", completed: false }),
      addTodo({ id: "t3", title: "Ship the screenshots", completed: false }),
    ]);
    const { setGroupName, setGroupDescription, addMember } =
      actions["powerhouse/reactor-group"];
    await client.execute(group.id, "main", [
      setGroupName({ name: "Core team" }),
      setGroupDescription({ description: "Maintainers of connect-core" }),
      addMember({ address: "0x1111111111111111111111111111111111111111" }),
      addMember({ address: "0x2222222222222222222222222222222222222222" }),
    ]);

    // Only the generic chrome loads this app; core shows the drive's listing instead.
    const explorer = await rb.addDrive(
      { global: { name: "Explorer" } },
      "GenericDriveExplorer",
    );
    await rb.addFolder(explorer.header.id, "Designs");
    await rb.addDocument(explorer.header.id, "Backlog", "test/todo");
    const empty = await rb.addDrive({ global: { name: "Scratch" } });

    const [base, driveApp, emptyDrive] = (
      await Promise.all(
        [drive, explorer.header.id, empty.header.id].map((id) =>
          client.get(id),
        ),
      )
    ).map((doc) => `/d/${rb.makeDriveSlug(doc)}`);
    return {
      paths: {
        drive: base,
        folder: `${base}/${rb.makeNodeSlug(reports)}`,
        todo: `${base}/${rb.makeNodeSlug(todo)}`,
        group: `${base}/${rb.makeNodeSlug(group)}`,
        driveApp,
        emptyDrive,
      },
    };
  }, REACTOR_BROWSER);
}

/** A fresh browser context with core's views on and the demo drives seeded. */
export async function openSeededPage(
  browser: Browser,
  options: OpenOptions = {},
  attempt = 0,
): Promise<SeededPage> {
  const { context, page } = await openConnect(browser, options);
  try {
    return { context, page, seeded: await seedInBrowser(page) };
  } catch (error) {
    // A cold studio re-optimises deps and reloads; a fresh context seeds anew.
    if (!connectDev() || attempt >= 2) throw error;
    await context.close();
    return openSeededPage(browser, options, attempt + 1);
  }
}

/** Opens `path` in Connect and waits for its reactor. */
export async function goto(page: Page, path: string): Promise<void> {
  await page.goto(CONNECT + path);
  await waitForReactor(page);
}
