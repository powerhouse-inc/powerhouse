import {
  DEFAULT_CONNECT_STUDIO_PORT,
  type PHConnectCompositionEntry,
  type PHConnectDefaultDrive,
  type PHConnectRuntimeConfig,
} from "@powerhousedao/shared/clis";
import {
  entryActiveForVerb,
  isStructuralMultiReactor,
  mergeDefaultDrives,
  normalizePluginEntries,
  pluginEntrySchema,
  profileSchema,
  resolveDriveDeclaration,
  type DriveDeclaration,
  type PluginEntry,
  projectDrivesIntoConnect,
  projectReactorToConnect,
  reactorSchema,
  remoteBackendUrls,
  type HostDefinition,
  type ReactorConfig,
  type RunnerContext,
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
 * `ph connect studio` command calls — no forked behavior. Real verbs
 * (`build`, `serve`) arrive with later phases; their absence here is
 * deliberate and surfaces through the verb-listing error.
 */

export const kind = "reactor";

/** Phase-2 schema (D2.d): `reactor` and `profile` validate strictly via the
 * shared host-core schemas — a typo'd protocol key fails instead of silently
 * not applying. `config` stays loose: it is runner-defined by design. */
export const hostSchema = z.looseObject({
  name: z.string().min(1),
  runner: z.looseObject({
    module: z.string(),
    port: z.number().int().positive().optional(),
    host: z.string().optional(),
    https: z.boolean().optional(),
    openBrowser: z.boolean().optional(),
    // The host's routes folder, project-relative; false for none. Default: hosts/connect/routes.
    routes: z.union([z.string(), z.literal(false)]).optional(),
    // THE COMPOSITION (rewire R3): plugin entries, presence is activation.
    plugins: z.array(pluginEntrySchema).optional(),
  }),
  config: z.looseObject({}).optional(),
  profile: profileSchema,
  reactor: reactorSchema.optional(),
});

/** The studio arg surface is wide (commonArgs + server args); the service only
 * reads a known subset, and the repo's own tests build these objects the same
 * way (Partial + cast — see connect-build.test.ts `mk()`). */
function toStudioArgs(host: HostDefinition): ConnectStudioArgs {
  const runner = host.runner;
  const args: Partial<ConnectStudioArgs> = {
    port:
      typeof runner.port === "number"
        ? runner.port
        : DEFAULT_CONNECT_STUDIO_PORT,
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
  host: HostDefinition,
  ctx?: RunnerContext,
  verb = "dev",
): PHConnectRuntimeConfig | undefined {
  const base = (host.config ?? {}) as PHConnectRuntimeConfig;
  const reactor = host.reactor as ReactorConfig | undefined;

  // R3: the composition (verb-filtered, projected as DATA — the browser
  // pipeline resolves and runs the entries), declared drives, and the
  // reactor-core identity/namespace keys.
  const entries = (host.runner as { plugins?: PluginEntry[] }).plugins;
  const composition: PHConnectCompositionEntry[] | undefined =
    entries === undefined
      ? undefined
      : normalizePluginEntries(entries, `hosts/${host.name}/host.js`)
          .filter((entry) => entryActiveForVerb(entry, verb))
          .map((entry) => ({ module: entry.module, config: entry.config }));
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
        entry.verbs === "*"
          ? ""
          : ` verbs=[${(entry.verbs as string[]).join(",")}]`;
      const cfg = Object.keys(entry.config ?? {});
      console.log(
        `[connect]   ${active ? "•" : "○"} ${entry.module}${scope}` +
          (cfg.length ? ` config: {${cfg.join(", ")}}` : "") +
          (active ? "" : " (inactive for this verb)"),
      );
    }
  }
  const declared = (reactor as { drives?: DriveDeclaration[] } | undefined)
    ?.drives;
  const declaredDefaults =
    declared && ctx
      ? declaredDrivesToDefaults(ctx.projectRoot, declared)
      : undefined;
  const reactorRenown = (reactor as { renown?: unknown } | undefined)?.renown;
  const reactorNamespace = (reactor as { namespace?: string } | undefined)
    ?.namespace;
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
  if (reactorRenown)
    base.renown = { ...(reactorRenown as object), ...base.renown };
  if (reactorNamespace !== undefined)
    base.instance = {
      ...base.instance,
      namespace: base.instance?.namespace ?? reactorNamespace,
    } as typeof base.instance;
  const { connect } = projectReactorToConnect(reactor);
  const structural = isStructuralMultiReactor(reactor);
  if (!connect.reactor && !connect.instance && !connect.app && !structural) {
    // `base` is host.config when there is one; without, it may still carry the composition.
    return host.config !== undefined || composition ? base : undefined;
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

// The favicon was built into the dist; served, its path would mean nothing.
function withoutFavicon(config: PHConnectRuntimeConfig | undefined) {
  if (config?.branding?.favicon === undefined) return config;
  const { favicon: _, ...branding } = config.branding;
  return { ...config, branding };
}

const routesOf = (host: HostDefinition) => {
  const routes = host.runner.routes;
  return typeof routes === "string" || routes === false ? routes : undefined;
};

export async function dev(
  host: HostDefinition,
  ctx: RunnerContext,
): Promise<void> {
  const { runConnectStudio } = await import("../services/connect-studio.js");
  await runConnectStudio(
    toStudioArgs(host),
    undefined,
    callerOverride(host, ctx, ctx.verb ?? "dev"),
    { routes: routesOf(host) },
  );
}

/** `run` is dev-studio until the plugin phases give hosts a production
 * runtime; `serve` (below) is the static production server. */
export const run = dev;

/** P3.3 — `build`: the SAME service as classic `ph connect build`. */
export async function build(
  host: HostDefinition,
  ctx: RunnerContext,
): Promise<void> {
  const { runConnectBuild } = await import("../services/connect-build.js");
  const runner = host.runner;
  const args: Partial<ConnectBuildArgs> = {
    outDir: typeof runner.outDir === "string" ? runner.outDir : "dist",
  };
  // The host's config bakes in: its title, favicon, manifest, base path and loading shell.
  await runConnectBuild(
    args as ConnectBuildArgs,
    callerOverride(host, ctx, ctx.verb ?? "build"),
    { routes: routesOf(host) },
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
  host: HostDefinition,
  ctx: RunnerContext,
): Promise<void> {
  const { runConnectPreview } = await import("../services/connect-preview.js");
  const runner = host.runner;
  const args: Partial<ConnectPreviewArgs> = {
    port:
      typeof runner.port === "number"
        ? runner.port
        : DEFAULT_CONNECT_STUDIO_PORT,
    outDir: typeof runner.outDir === "string" ? runner.outDir : "dist",
    open: runner.openBrowser === true,
    strictPort: runner.strictPort === true,
    cors: true,
    printUrls: true,
    bindCLIShortcuts: false,
    // Explicit IPv4 loopback (runner.host overrides): vite's default
    // "localhost" can bind ::1 only on Windows, and a supervising shell
    // (ph-win) probes 127.0.0.1 — the sidecar this replaces bound 127.0.0.1.
    host: typeof runner.host === "string" ? runner.host : "127.0.0.1",
  };
  const override = withoutFavicon(
    callerOverride(host, ctx, ctx.verb ?? "serve"),
  );
  await runConnectPreview(args as ConnectPreviewArgs, {
    connect: override,
    cspRegistrySync: runner.cspRegistrySync === true,
  });
}
