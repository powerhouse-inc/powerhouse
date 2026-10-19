import {
  DEFAULT_CONNECT_STUDIO_PORT,
  type PHConnectCompositionEntry,
  type PHConnectDefaultDrive,
  type PHConnectRuntimeConfig,
} from "@powerhousedao/shared/clis";
import { connectConfigSchema } from "@powerhousedao/shared/connect/connect-config-schema";
import {
  entryActiveForVerb,
  isStructuralMultiReactor,
  mergeDefaultDrives,
  normalizePluginEntries,
  PluginError,
  unresolvedDriveReferences,
  resolveDriveDeclaration,
  type DriveDeclaration,
  projectDrivesIntoConnect,
  projectReactorToConnect,
  reactorHostSchema,
  remoteBackendUrls,
  runnerBaseSchema,
  type ReactorConfig,
  type RunnerContext,
  type RunnerHandle,
} from "@powerhousedao/host-core";
import { z } from "zod";
import type {
  ConnectBuildArgs,
  ConnectPreviewArgs,
  ConnectStudioArgs,
} from "../types.js";

/**
 * BRIDGE runner for Connect hosts (uniform-runners phase 0): maps a
 * hosts/connect/host.js definition onto the SAME service the classic
 * `ph connect studio` (dev/run), `ph connect build` and `ph connect preview`
 * (serve) commands call — no forked behavior.
 */

export const kind = "reactor";

/** The connect host: the host-core reactor host with every runner option
 * this module reads declared (strict: an unknown runner key fails), and
 * `config` typed by Connect's own zod schema (the authored `connect` block). */
export const hostSchema = reactorHostSchema.extend({
  runner: runnerBaseSchema
    .extend({
      /** Open a browser tab once listening (dev/serve). */
      openBrowser: z.boolean().optional(),
      /** Fail instead of moving to the next free port when `port` is taken. */
      strictPort: z.boolean().optional(),
      /** The Connect build output dir (`build` writes it, `serve` serves it). */
      outDir: z.string().min(1).optional(),
      /** Patch the baked CSP for the runtime registry (`serve`); a compound's
       * wiring sets it on its connect member. */
      cspRegistrySync: z.boolean().optional(),
    })
    .strict(),
  config: connectConfigSchema.optional(),
});

/** What a connect host.js author writes. */
export type ConnectHost = z.input<typeof hostSchema>;
/** What a verb receives (defaults applied). */
export type ConnectHostParsed = z.output<typeof hostSchema>;

/** What a started Connect (`dev`/`run`/`serve`) produces: the origin it
 * actually listens on and the app URL (origin plus base path). */
export const outputsSchema = z.strictObject({
  origin: z.url(),
  endpoints: z.strictObject({ connect: z.url() }),
});
export type ConnectOutputs = z.infer<typeof outputsSchema>;

declare global {
  interface PHHostRunners {
    "@powerhousedao/ph-cli/runners/connect": {
      host: ConnectHost;
      outputs: ConnectOutputs;
    };
  }
}

/** The slice of a vite dev/preview server a handle needs. */
interface ListeningServer {
  resolvedUrls: { local: string[] } | null;
  close(): Promise<void>;
}

/** A started Connect as a runner handle. vite has already listened when the
 * service returns, so `ready` is settled; the outputs carry the URL vite
 * resolved (the port it actually bound), falling back to the requested one. */
function connectHandle(
  server: ListeningServer,
  requested: { host: string; port: number },
): RunnerHandle<ConnectOutputs> {
  const fallback = `http://${requested.host}:${requested.port}/`;
  const app = server.resolvedUrls?.local[0] ?? fallback;
  let closing: Promise<void> | undefined;
  return {
    outputs: outputsSchema.parse({
      origin: new URL(app).origin,
      endpoints: { connect: app },
    }),
    ready: Promise.resolve(),
    shutdown: () => (closing ??= server.close()),
  };
}

/** The studio arg surface is wide (commonArgs + server args); the service only
 * reads a known subset, and the repo's own tests build these objects the same
 * way (Partial + cast — see connect-build.test.ts `mk()`). */
function toStudioArgs(host: ConnectHostParsed): ConnectStudioArgs {
  const runner = host.runner;
  const args: Partial<ConnectStudioArgs> = {
    port: runner.port ?? DEFAULT_CONNECT_STUDIO_PORT,
    open: runner.openBrowser === true,
    strictPort: runner.strictPort === true,
    printUrls: true,
    bindCLIShortcuts: false,
  };
  return args as ConnectStudioArgs;
}

/** Merge the reactor-block projection (protocol → connect.reactor,
 * backend kind → instance.reactorWorker, workflows → app.workflowsEnabled)
 * into the host's connect config, which rides the studio caller-override.
 * The host config wins on conflict (an explicit connect.* value is intent) —
 * EXCEPT structural multi-reactor (P4.2): declaring a remote backend next to
 * a local one IS the intent, so it beats a scaffold-default
 * instance.multiReactor: false, and the remote's drive url merges FIRST into
 * drives.defaultDrives (the first url entry is what the routing client dials). */
/** host.js reactor.drives -> the served drives.defaultDrives shapes: locals
 * carry id/name/icon and the preferredEditor under its Connect alias `app`;
 * remotes carry their URL. */
function declaredDrivesToDefaults(
  projectRoot: string,
  declarations: readonly DriveDeclaration[],
): PHConnectDefaultDrive[] {
  return declarations.map((declaration) => {
    const drive = resolveDriveDeclaration(projectRoot, declaration);
    if (drive.kind === "remote") {
      return {
        url: drive.remoteUrl!,
        name: drive.name,
        icon: drive.icon ?? null,
      };
    }
    return {
      local: true as const,
      id: drive.id,
      name: drive.name,
      icon: drive.icon ?? null,
      ...(drive.preferredEditor ? { app: drive.preferredEditor } : {}),
    };
  });
}

function callerOverride(
  host: ConnectHostParsed,
  ctx?: RunnerContext,
  verb = "dev",
): PHConnectRuntimeConfig | undefined {
  // A copy: the projection below adds served-only keys (composition, …).
  const base: PHConnectRuntimeConfig = { ...host.config };
  const reactor: ReactorConfig | undefined = host.reactor;

  // R3: the composition (verb-filtered, projected as DATA — the browser
  // pipeline resolves and runs the entries), declared drives, and the
  // reactor-core identity/namespace keys.
  const entries = host.runner.plugins;
  const composition: PHConnectCompositionEntry[] | undefined =
    entries === undefined
      ? undefined
      : normalizePluginEntries(entries, `hosts/${host.name}/host.js`)
          .filter((entry) => entryActiveForVerb(entry, verb))
          .map((entry) => ({ module: entry.module, config: entry.config }));
  // A drive reference (`{ from, slug }`) is derived by a supervising compound
  // from the referenced member's drives. Reaching this runner unresolved
  // means there is no such member: standalone `ph run connect`, or a
  // compound member that is not started before this one.
  for (const entry of composition ?? []) {
    for (const { key, reference } of unresolvedDriveReferences(entry.config)) {
      throw new PluginError(
        `hosts/${host.name}/host.js: plugin "${entry.module}" config.${key} refers to drive "${reference.slug}" of member "${reference.from}", but this Connect is not running inside a compound that started it.`,
        `Run the compound that declares "${reference.from}" (and list it before this member in config.startOrder), or spell the drive URL: { ${key}: "http://localhost:<port>/d/${reference.slug}" }.`,
      );
    }
  }
  if (entries !== undefined) {
    // Change 2: show the composition plan on the `ph run connect` terminal.
    // The pipeline itself runs in the browser (hook execution logs to the
    // browser console); here we report WHAT will be served and for which verb.
    const all = normalizePluginEntries(entries, `hosts/${host.name}/host.js`);
    console.log(
      `[connect] composition plan (verb=${verb}): ${composition?.length ?? 0} active of ${all.length} declared`,
    );
    for (const entry of all) {
      const active = entryActiveForVerb(entry, verb);
      const scope =
        entry.verbs === "*" ? "" : ` verbs=[${entry.verbs.join(",")}]`;
      const cfg = Object.keys(entry.config);
      console.log(
        `[connect]   ${active ? "•" : "○"} ${entry.module}${scope}` +
          (cfg.length ? ` config: {${cfg.join(", ")}}` : "") +
          (active ? "" : " (inactive for this verb)"),
      );
    }
  }
  const declared = reactor?.drives;
  const declaredDefaults =
    declared && ctx
      ? declaredDrivesToDefaults(ctx.projectRoot, declared)
      : undefined;
  const reactorRenown = reactor?.renown;
  const reactorNamespace = reactor?.namespace;
  base.drives = declaredDefaults
    ? {
        ...base.drives,
        defaultDrives: mergeDefaultDrives(
          declaredDefaults,
          base.drives?.defaultDrives ?? [],
        ),
        preserveStrategy: base.drives?.preserveStrategy ?? "preserve-all",
      }
    : base.drives;
  if (composition) base.composition = composition;
  if (reactorRenown) base.renown = { ...reactorRenown, ...base.renown };
  if (reactorNamespace !== undefined)
    base.instance = {
      ...base.instance,
      namespace: base.instance?.namespace ?? reactorNamespace,
    } as typeof base.instance;
  const { connect } = projectReactorToConnect(reactor);
  const structural = isStructuralMultiReactor(reactor);
  if (!connect.reactor && !connect.instance && !connect.app && !structural) {
    // `base` IS host.config when the host has one; a host without a config
    // block still carries its composition and drives (set on `base` above).
    return base;
  }
  const drives = structural
    ? projectDrivesIntoConnect({
        createdDriveUrls: remoteBackendUrls(reactor),
        configuredDefaultDrives: base.drives?.defaultDrives,
      }).drives
    : base.drives;
  // When the host DECLARES backends, instance facts derive from them and win
  // over config defaults (declaring `kind: "worker"` is more explicit intent
  // than a scaffold's `reactorWorker: false`); without backends the P2 rule
  // stands — an explicit connect.* value wins over descriptive projection.
  const declaresBackends = Object.keys(reactor?.backends ?? {}).length > 0;
  const instance = declaresBackends
    ? {
        ...base.instance,
        ...connect.instance,
        ...(structural ? { multiReactor: true } : {}),
      }
    : { ...connect.instance, ...base.instance };
  return {
    ...base,
    reactor: { ...connect.reactor, ...base.reactor },
    instance: instance as never,
    app: { ...connect.app, ...base.app },
    ...(drives ? { drives: { ...base.drives, ...drives } } : {}),
  };
}

export async function dev(
  host: ConnectHostParsed,
  ctx: RunnerContext,
): Promise<RunnerHandle<ConnectOutputs>> {
  const { runConnectStudio } = await import("../services/connect-studio.js");
  const args = toStudioArgs(host);
  const server = await runConnectStudio(
    args,
    undefined,
    callerOverride(host, ctx, ctx.verb),
  );
  // vite's dev server binds its default host ("localhost") here.
  return connectHandle(server, { host: "localhost", port: args.port });
}

/** `run` is dev-studio until the plugin phases give hosts a production
 * runtime; `serve` (below) is the static production server. */
export const run = dev;

/** P3.3 — `build`: the SAME service as classic `ph connect build`. */
export async function build(
  host: ConnectHostParsed,
  _ctx: RunnerContext,
): Promise<void> {
  const { runConnectBuild } = await import("../services/connect-build.js");
  const args: Partial<ConnectBuildArgs> = {
    outDir: host.runner.outDir ?? "dist",
  };
  await runConnectBuild(args as ConnectBuildArgs);
}

/** P3.3 — `serve`: the SAME vite preview server as classic
 * `ph connect preview` (static serve of a built Connect; run `build` first).
 * The host's connect config (including a supervising compound's projected
 * drives and the reactor projection) rides a serve override: the baked
 * powerhouse.config.json merges with it at request time, and
 * `runner.cspRegistrySync` (set by the compound's wiring) patches the baked
 * CSP's script-src for the runtime registry — together these replace the
 * ph-win-desktop sidecar's hand-rolled static server (desktop shape). */
export async function serve(
  host: ConnectHostParsed,
  ctx: RunnerContext,
): Promise<RunnerHandle<ConnectOutputs>> {
  const { runConnectPreview } = await import("../services/connect-preview.js");
  const runner = host.runner;
  const port = runner.port ?? DEFAULT_CONNECT_STUDIO_PORT;
  const bind = runner.host ?? "127.0.0.1";
  const args: Partial<ConnectPreviewArgs> = {
    port,
    outDir: runner.outDir ?? "dist",
    open: runner.openBrowser === true,
    strictPort: runner.strictPort === true,
    cors: true,
    printUrls: true,
    bindCLIShortcuts: false,
    // Explicit IPv4 loopback (runner.host overrides): vite's default
    // "localhost" can bind ::1 only on Windows, and a supervising shell
    // (ph-win) probes 127.0.0.1 — the sidecar this replaces bound 127.0.0.1.
    host: bind,
  };
  const override = callerOverride(host, ctx, ctx.verb);
  const server = await runConnectPreview(args as ConnectPreviewArgs, {
    connect: override,
    cspRegistrySync: runner.cspRegistrySync === true,
  });
  return connectHandle(server, { host: bind, port });
}
