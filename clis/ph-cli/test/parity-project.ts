import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ResolvedPlugin } from "@powerhousedao/host-core";
import { overlayOf } from "./parity-gate.js";

/**
 * What the parity gates run both paths against: a temp project made from the
 * scaffold templates, and stand-ins for the services both paths end in. The
 * stand-ins record their calls here; a test file hands them to `vi.mock`
 * (the factory imports this module) and reads them back with `observe`.
 */

export const PROJECT_NAME = "parity-lab";

/** What the two paths' drive ids are made of: stands in for the hash of a
 * temp dir, so two projects compare. */
const HASH_TOKEN = "<project-hash>";
const ROOT_TOKEN = "<project>";

const here = import.meta.dirname;
/** A package that resolves the scaffold's runner specifiers to this
 * checkout's runner sources, so the mocks of the test file reach them. */
const RUNNERS_STUB = path.join(here, "fixtures", "parity-gate", "ph-cli");
const HOST_CORE = path.resolve(here, "..", "..", "..", "packages", "host-core");
const linkType = process.platform === "win32" ? "junction" : "dir";

export interface ParityProject {
  root: string;
  /** The `connect` block of the project's powerhouse.config.json. */
  connectConfig: unknown;
  /** Takes this project's dir and its hash out of a rendered value. */
  normalize: (text: string) => string;
}

const roots: string[] = [];

/** The first 8 hex digits both paths append to a project drive's name. */
export function projectHash(root: string): string {
  return createHash("sha256").update(root).digest("hex").substring(0, 8);
}

export async function makeParityProject(): Promise<ParityProject> {
  const root = realpathSync.native(
    mkdtempSync(path.join(tmpdir(), "ph-parity-gate-")),
  );
  roots.push(root);
  writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: PROJECT_NAME, type: "module" }),
  );
  // Imported here: the mock factories of a test file import this module, and
  // the templates import packages those factories stand in for.
  const { buildHostsTemplates, buildPowerhouseConfigTemplate } =
    await import("@powerhousedao/codegen/templates");
  const config = await buildPowerhouseConfigTemplate({ name: PROJECT_NAME });
  writeFileSync(path.join(root, "powerhouse.config.json"), config);
  const templates = buildHostsTemplates(PROJECT_NAME);
  const hosts: [string, string][] = [
    ["switchboard", templates.switchboardHost],
    ["connect", templates.connectHost],
    ["vetra", templates.vetraHost],
  ];
  for (const [name, source] of hosts) {
    mkdirSync(path.join(root, "hosts", name), { recursive: true });
    writeFileSync(path.join(root, "hosts", name, "host.js"), source);
  }
  const scope = path.join(root, "node_modules", "@powerhousedao");
  mkdirSync(scope, { recursive: true });
  symlinkSync(RUNNERS_STUB, path.join(scope, "ph-cli"), linkType);
  symlinkSync(HOST_CORE, path.join(scope, "host-core"), linkType);
  // A drifted literal, as an MCP client's config from another port has.
  writeFileSync(
    path.join(root, ".mcp.json"),
    JSON.stringify({
      mcpServers: {
        "reactor-mcp": { type: "http", url: "http://localhost:1/mcp" },
      },
    }),
  );
  const hash = projectHash(root);
  const { connect } = JSON.parse(config) as { connect?: unknown };
  return {
    root,
    connectConfig: connect,
    normalize: (text) => {
      const hashed = text.replaceAll(hash, HASH_TOKEN);
      if (!hashed.includes(root)) return hashed;
      return hashed.replaceAll(root, ROOT_TOKEN).replaceAll(path.sep, "/");
    },
  };
}

/** After the test left them: a dir that is the cwd cannot be removed. */
export function removeParityProjects(): void {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true, maxRetries: 5 });
  }
}

/* ------------------------------------------------------------ stand-ins */

interface Recorded {
  switchboardCalls: unknown[][];
  studioCalls: unknown[][];
  /** The plugin entries a runner had resolved, by the kind it asked for. */
  pluginEntries: Record<string, unknown>;
  /** Drives a caller created after the server started, by slug. */
  seeds: Record<string, unknown>;
  portProbes: number[];
  githubUrlCalls: unknown[][];
}

const fresh = (): Recorded => ({
  switchboardCalls: [],
  studioCalls: [],
  pluginEntries: {},
  seeds: {},
  portProbes: [],
  githubUrlCalls: [],
});

export const recorded: Recorded = fresh();

export function resetRecorded(): void {
  Object.assign(recorded, fresh());
}

interface ServerOptions {
  port: number;
  remoteDrives?: string[];
  useVetraDrive?: boolean;
  vetraDriveId?: string;
}

/** The default drive's URL as the server reports it: none when the caller
 * replaces the drive, a remote drive's slug when one is given, else the
 * vetra or the powerhouse drive (apps/switchboard server.mts). */
function defaultDriveUrlOf(options: ServerOptions): string | undefined {
  const origin = `http://localhost:${options.port}`;
  const remote = options.remoteDrives?.at(0);
  if (remote) return `${origin}/d/${remote.split("/").pop()}`;
  if ("drive" in options) return undefined;
  if (options.useVetraDrive) return `${origin}/d/${options.vetraDriveId}`;
  return `${origin}/d/powerhouse`;
}

const seedDrive = (
  _reactor: unknown,
  drive: { slug: string },
  port: number,
): Promise<string> => {
  recorded.seeds[drive.slug] = drive;
  return Promise.resolve(`http://localhost:${port}/d/${drive.slug}`);
};

/** Stands in for `@powerhousedao/ph-run/switchboard` (the service). */
export const switchboardService = {
  POWERHOUSE_DRIVE_ICON: "powerhouse-drive-icon",
  projectDriveId: (name: string, projectRoot: string) =>
    `${name}-${projectHash(projectRoot)}`,
  seedWorkflowsDrive: (reactor: unknown, port: number) =>
    seedDrive(reactor, { slug: "workflows" }, port),
  startSwitchboard: (...call: unknown[]) => {
    recorded.switchboardCalls.push(call);
    const options = call[0] as ServerOptions;
    return Promise.resolve({
      port: options.port,
      // Classic seeds the Workflows drive only when the project config turns
      // workflows on, and the scaffold's config does not.
      workflowsEnabled: false,
      mcpEnabled: true,
      defaultDriveUrl: defaultDriveUrlOf(options),
      renown: undefined,
      inspector: undefined,
      reactor: { resolveIdOrSlug: () => Promise.resolve(undefined) },
      shutdown: () => Promise.resolve(),
    });
  },
};

/** Stands in for `@powerhousedao/switchboard/utils`. */
export const switchboardUtils = {
  addDefaultDrive: seedDrive,
  ensureDrive: seedDrive,
};

/** Stands in for `../src/services/connect-studio.js`. */
export const connectStudioService = {
  runConnectStudio: (...call: unknown[]) => {
    recorded.studioCalls.push(call);
    const { port } = call[0] as { port: number };
    return Promise.resolve({
      resolvedUrls: { local: [`http://localhost:${port}/`], network: [] },
      close: () => Promise.resolve(),
    });
  },
};

/** Stands in for `../src/utils/resolve-switchboard-port.js`. */
export const portResolver = {
  resolveSwitchboardPort: (port: number) => {
    recorded.portProbes.push(port);
    return Promise.resolve(port);
  },
};

/** Stands in for `../src/utils/configure-vetra-github-url.js`. */
export const githubUrl = {
  sleep: () => Promise.resolve(),
  configureVetraGithubUrl: (...call: unknown[]) => {
    recorded.githubUrlCalls.push(call);
    return Promise.resolve();
  },
};

const WORKFLOWS_PLUGIN = "@powerhousedao/switchboard/plugins/workflows";

const moduleOf = (entry: unknown): unknown =>
  typeof entry === "object" && entry !== null && "module" in entry
    ? entry.module
    : entry;

/**
 * Stands in for host-core's `resolveHostPlugins`: the plugins themselves are
 * not loaded. The workflows entry resolves to its drive contribution, which
 * the scaffold's Studio member reads from the switchboard's outputs; every
 * other entry resolves to nothing.
 */
export function resolveHostPlugins(
  _projectRoot: string,
  runnerKind: string,
  _verb: string,
  entries: readonly unknown[],
): Promise<ResolvedPlugin[]> {
  recorded.pluginEntries[runnerKind] = entries;
  if (!entries.some((entry) => moduleOf(entry) === WORKFLOWS_PLUGIN)) {
    return Promise.resolve([]);
  }
  return Promise.resolve([
    {
      entry: {
        module: WORKFLOWS_PLUGIN,
        enabled: true,
        verbs: "*",
        config: { drive: { slug: "workflows", name: "Workflows" } },
      },
      provenance: "dependency",
      plugin: {
        name: "switchboard-workflows",
        appliesTo: "switchboard",
        contributions: {
          drives: [
            {
              slug: "workflows",
              name: "Workflows",
              preferredEditor: "workflow-studio",
              projectHash: "id",
            },
          ],
        },
      },
    },
  ]);
}

/* ----------------------------------------------------------- observing */

/** Paths of an observation that are compared by presence only. */
export const OPAQUE_PATHS = [
  "switchboard.logger",
  "switchboard.base",
  "switchboard.options.pluginComposition",
  "studio.logger",
];

function mcpUrlOf(root: string): unknown {
  const file = path.join(root, ".mcp.json");
  const parsed = JSON.parse(readFileSync(file, "utf8")) as {
    mcpServers?: Record<string, { url?: string }>;
  };
  return parsed.mcpServers?.["reactor-mcp"]?.url;
}

function runRecordsOf(root: string): string[] {
  const dir = path.join(root, ".ph", "run");
  return existsSync(dir) ? readdirSync(dir).sort() : [];
}

/**
 * What one path did since `resetRecorded`, in the project it ran in. Read it
 * while the stack is up: a shutdown clears the records under `.ph`.
 *
 * - `switchboard`: the one `startSwitchboard` call, by parameter.
 * - `studio`: the one `runConnectStudio` call, by parameter. `override` is
 *   the Connect config the caller hands over, less what the project's own
 *   `connect` block already says (classic passes an override, a host its
 *   whole config).
 * - `plugins`: the composition entries a runner had resolved.
 * - `seeds`: the drives the caller created itself after the server started.
 * - `effects`: what the caller left on disk or asked of the machine.
 */
export function observe(project: ParityProject): Record<string, unknown> {
  const { switchboardCalls, studioCalls } = recorded;
  if (switchboardCalls.length !== 1) {
    throw new Error(
      `Expected one startSwitchboard call, saw ${switchboardCalls.length}.`,
    );
  }
  if (studioCalls.length > 1) {
    throw new Error(
      `Expected one runConnectStudio call at most, saw ${studioCalls.length}.`,
    );
  }
  const [options, logger, base] = switchboardCalls[0];
  const observation: Record<string, unknown> = {
    switchboard: { options, logger, base },
    plugins: recorded.pluginEntries,
    seeds: recorded.seeds,
    effects: {
      vetraRuntimeRecord: existsSync(
        path.join(project.root, ".ph", "vetra-runtime.json"),
      ),
      runRecords: runRecordsOf(project.root).join(", "),
      mcpJsonUrl: mcpUrlOf(project.root),
      portProbes: recorded.portProbes.join(", "),
      githubUrlCalls: recorded.githubUrlCalls.length,
    },
  };
  if (studioCalls.length === 1) {
    const [args, studioLogger, override, studioOptions] = studioCalls[0];
    const handed: unknown =
      typeof override === "function" ? (override as () => unknown)() : override;
    observation.studio = {
      args,
      logger: studioLogger,
      override: overlayOf(handed, project.connectConfig),
      options: studioOptions,
    };
  }
  return observation;
}

/* ------------------------------------------------------- process state */

type AnyListener = (...args: unknown[]) => void;
const listenersOf = (event: string) =>
  process.listeners(event as "exit") as AnyListener[];

/** Both paths install exit and signal listeners for the life of the CLI
 * process. Returns what removes the ones added since. */
export function trackProcessListeners(): () => void {
  const events = ["exit", "SIGINT", "SIGTERM"];
  const before = events.map((event) => new Set(listenersOf(event)));
  return () => {
    events.forEach((event, index) => {
      for (const listener of listenersOf(event)) {
        if (!before[index].has(listener)) {
          process.removeListener(event, listener);
        }
      }
    });
  };
}

/** Env that would change either path's defaults on a developer's machine. */
export const NEUTRAL_ENV = [
  "PH_SWITCHBOARD_PORT",
  "PH_VETRA_CONNECT_PORT",
  "PH_PACKAGES",
  "PH_LOCAL_PACKAGE",
  "PH_CONNECT_LOG_LEVEL",
  "PH_USER_DATA_DIR",
  "PH_STOP_ON_STDIN",
  "PH_CATCH_UP_PROGRESS",
  "RENOWN_URL",
  "SWITCHBOARD_URL",
  "SENTRY_DSN",
  "TEMPO_ENDPOINT",
  "OTEL_EXPORTER_OTLP_ENDPOINT",
  "LOG_LEVEL",
];
