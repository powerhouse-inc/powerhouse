import {
  DEFAULT_CONNECT_STUDIO_PORT,
  type PHConnectCompositionEntry,
  type PHConnectDefaultDrive,
  type PHConnectRuntimeConfig,
} from "@powerhousedao/shared/clis";
import { connectConfigSchemaWith } from "@powerhousedao/shared/connect/connect-config-schema";
import { isPassthroughImageRef } from "@powerhousedao/shared/connect/image-ref";
import {
  defineHostSchemas,
  entryActiveForVerb,
  findDeadConnectConfig,
  isStructuralMultiReactor,
  mergeDefaultDrives,
  normalizePluginEntries,
  resolveDriveDeclaration,
  type DriveDeclaration,
  projectDrivesIntoConnect,
  projectReactorToConnect,
  remoteBackendUrls,
  type ReactorConfig,
  type RunnerContext,
  type RunnerHandle,
} from "@powerhousedao/host-core";
import { join } from "node:path";
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
 * `config` typed by Connect's own zod schema (the authored `connect` block),
 * whose URL fields that name another host's outputs
 * (`drives.defaultDrives[].url`, `renown.switchboardUrl`) are token-able.
 * One definition, two schemas: `declaredHostSchema` (token-able fields take
 * output tokens; types host files) and `hostSchema` (resolved; checked
 * right before the verb). */
const schemas = defineHostSchemas((s) =>
  s.reactorHostSchema.extend({
    runner: s.runnerBaseSchema
      .extend({
        /** Open a browser tab once listening (dev/serve). */
        openBrowser: z.boolean().optional(),
        /** Fail instead of moving to the next free port when `port` is taken. */
        strictPort: z.boolean().optional(),
        /** The Connect build output dir (`build` writes it, `serve` serves it). */
        outDir: z.string().min(1).optional(),
        /** Patch the baked CSP for the runtime registry (`serve`); a
         * compound's wiring sets it on its connect member. */
        cspRegistrySync: z.boolean().optional(),
        /** The host's routes folder, project-relative; false for none.
         * Default: hosts/connect/routes. */
        routes: z.union([z.string(), z.literal(false)]).optional(),
      })
      .strict(),
    config: connectConfigSchemaWith(s.tokenable).optional(),
  }),
);
export const declaredHostSchema = schemas.declaredHostSchema;
export const hostSchema = schemas.hostSchema;

/** What a connect host.js author writes. */
export type ConnectHost = z.input<typeof declaredHostSchema>;
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
  // Entry configs arrive RESOLVED: output tokens (e.g. the workflows
  // plugin's `drive: switchboard.drives.workflows.url`) were replaced by
  // `ph run` (standalone: the producer's run record; in a compound: the
  // member's live outputs) before validateHost let this verb run.
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
  // Config a Connect plugin owns, set on the host while that plugin is not
  // composed for this verb: Connect serves the plugin-absent value instead.
  for (const warning of findDeadConnectConfig(
    host.config,
    entries,
    verb,
    `hosts/${host.name}/host.js`,
  )) {
    console.warn(warning.message);
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
    // With none of the three, there is no override: a classic build.
    return host.config !== undefined || composition || declaredDefaults
      ? base
      : undefined;
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

/**
 * Start a server; under a supervising compound (`ctx.parent`), drop the
 * process-exiting signal listeners it installed (vite's dev and preview
 * servers exit on SIGTERM): the compound owns the exit and stops members in
 * reverse dependency order through their handles.
 */
async function startUnderSupervisor<T>(
  ctx: RunnerContext,
  start: () => Promise<T>,
): Promise<T> {
  if (!ctx.parent) return start();
  const signals = ["SIGINT", "SIGTERM"] as const;
  const before = new Map(
    signals.map((signal) => [signal, new Set(process.listeners(signal))]),
  );
  try {
    return await start();
  } finally {
    for (const signal of signals) {
      for (const listener of process.listeners(signal)) {
        if (!before.get(signal)?.has(listener)) {
          process.off(signal, listener);
        }
      }
    }
  }
}

/** Fail at `ph run`, naming the plugin and key, when a composed Connect
 * plugin's entry config does not match its schema. */
async function validateComposition(
  host: ConnectHostParsed,
  ctx: RunnerContext,
): Promise<void> {
  const { validateConnectPluginConfigs } =
    await import("./connect-plugin-configs.js");
  await validateConnectPluginConfigs(
    ctx.projectRoot,
    host.runner.plugins,
    ctx.verb,
    `hosts/${host.name}/host.js`,
  );
}

/** A project file the build resolved: the built dist has it (as icon.ico or
 * a data URI); served, its path would mean nothing. */
function isBuiltImage(ref: unknown): boolean {
  const src =
    typeof ref === "object" && ref !== null && "src" in ref ? ref.src : ref;
  return typeof src === "string" && !isPassthroughImageRef(src);
}

// The served config keeps the build's images: the favicon and any branding
// image given as a project path were resolved into the dist, and merged over
// it a path would replace the built data URI with a URL that 404s.
export function withoutBuiltImages(config: PHConnectRuntimeConfig | undefined) {
  const branding = config?.branding;
  if (!branding) return config;
  const { favicon: _, ...served } = branding;
  if (isBuiltImage(served.icon)) delete served.icon;
  if (isBuiltImage(served.loader)) delete served.loader;
  return { ...config, branding: served };
}

// Per host: Studio and other hosts' dev servers run side by side in one project.
const viteCacheOf = (host: ConnectHostParsed, ctx: RunnerContext) =>
  join(
    ctx.projectRoot,
    "node_modules",
    `.vite-${host.name.replace(/[^\w.-]/g, "_")}`,
  );

export async function dev(
  host: ConnectHostParsed,
  ctx: RunnerContext,
): Promise<RunnerHandle<ConnectOutputs>> {
  await validateComposition(host, ctx);
  const { runConnectStudio } = await import("../services/connect-studio.js");
  const args = toStudioArgs(host);
  const server = await startUnderSupervisor(ctx, () =>
    runConnectStudio(args, undefined, callerOverride(host, ctx, ctx.verb), {
      routes: host.runner.routes,
      cacheDir: viteCacheOf(host, ctx),
    }),
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
  ctx: RunnerContext,
): Promise<void> {
  await validateComposition(host, ctx);
  const { runConnectBuild } = await import("../services/connect-build.js");
  const args: Partial<ConnectBuildArgs> = {
    outDir: host.runner.outDir ?? "dist",
  };
  // The host's config bakes in: its title, favicon, manifest, base path and loading shell.
  await runConnectBuild(
    args as ConnectBuildArgs,
    callerOverride(host, ctx, ctx.verb),
    { routes: host.runner.routes },
  );
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
  await validateComposition(host, ctx);
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
  const override = withoutBuiltImages(callerOverride(host, ctx, ctx.verb));
  const server = await startUnderSupervisor(ctx, () =>
    runConnectPreview(args as ConnectPreviewArgs, {
      connect: override,
      cspRegistrySync: runner.cspRegistrySync === true,
    }),
  );
  return connectHandle(server, { host: bind, port });
}
