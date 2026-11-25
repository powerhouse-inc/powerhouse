import {
  DEFAULT_CONNECT_STUDIO_PORT,
  type PHConnectCompositionEntry,
  type PHConnectDefaultDrive,
  type PHConnectRuntimeConfig,
  type PowerhouseConfig,
} from "@powerhousedao/shared/clis";
import { deepMerge, resolveSourceConnect } from "@powerhousedao/shared/connect";
import { connectConfigSchemaWith } from "@powerhousedao/shared/connect/connect-config-schema";
import { isPassthroughImageRef } from "@powerhousedao/shared/connect/image-ref";
import {
  isSwitchboardProxyPath,
  withOriginPlaceholders,
} from "@powerhousedao/shared/connect/origin-placeholder";
import {
  defaultConnectComposition,
  defineHostSchemas,
  entryActiveForVerb,
  findDeadConnectConfig,
  isStructuralMultiReactor,
  mergeDefaultDrives,
  normalizePluginEntries,
  placeConnectDrives,
  pluginEntrySchema,
  resolveDriveDeclaration,
  type DriveDeclaration,
  projectDrivesIntoConnect,
  projectReactorToConnect,
  unservedConnectStorage,
  refineConnectReactor,
  remoteBackendUrls,
  RunnerError,
  defaultUserDataDir,
  type ReactorConfig,
  type RunnerContext,
  type RunnerHandle,
} from "@powerhousedao/host-core";
import {
  LOCAL_SIGN_IN_SECRET_ENV,
  newSignInSecret,
  openInBrowser,
  opensBrowser,
  signInLink,
  type LocalSignInIssuer,
} from "@powerhousedao/shared/clis/local-sign-in";
import type { ParsedCmdResult } from "@powerhousedao/shared/clis";
import {
  commonServerArgs,
  connectBuildArgs,
  connectStudioArgs,
} from "@powerhousedao/shared/clis/args";
import { command, runSafely } from "cmd-ts";
import { z } from "zod";
import { connectChromeDeprecation } from "./host-deprecations.js";
import { onlyPassed, runnerArgsSchemaOf } from "./runner-args.js";
import {
  connectPreviewServiceArgs,
  type ConnectPreviewArgs,
} from "../services/service-args.js";
import type { ConnectServeOverride } from "../services/connect-serve.js";

/**
 * The runner for Connect hosts: maps a hosts/connect/host.js definition
 * onto the Connect services — the studio (dev/run), the build and the
 * preview (serve). `ph connect studio|build|preview` are sugar for these
 * verbs.
 */

export const kind = "reactor";

/** The paths Connect itself answers, which a served file must not shadow. */
const CONNECT_OWN_PATHS = new Set(["/index.html", "/powerhouse.config.json"]);

/**
 * A `runner.serveFiles` path: `/` and segments of letters, digits and
 * `-._~`, none starting with a dot (no `.` or `..` segment, nothing hidden),
 * the last with an extension (an extensionless path is one of the app's
 * routes). Requests match it exactly, as sent, so no request reaches any
 * other file. Neither Connect's own files nor the switchboard's proxied
 * paths.
 */
const servedFilePath = z
  .string()
  .regex(
    /^(?:\/[A-Za-z0-9_~-][A-Za-z0-9._~-]*)*\/[A-Za-z0-9_~-][A-Za-z0-9._~-]*\.[A-Za-z0-9]+$/,
    {
      error: (issue) =>
        `"${String(issue.input)}" is no path Connect serves a file at: write /<name>.<ext> (segments of letters, digits and -._~, none starting with a dot).`,
    },
  )
  .superRefine((key, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message: `"${key}" ${message}` });
    if (CONNECT_OWN_PATHS.has(key)) {
      issue("is Connect's own file.");
    } else if (isSwitchboardProxyPath(key)) {
      issue("is the switchboard's path, which Connect's server proxies.");
    }
  });

/** The connect host: the host-core reactor host with every runner option
 * this module reads declared (strict: an unknown runner key fails), and
 * `config` typed by Connect's own zod schema (the authored `connect` block),
 * whose URL fields that name another host's outputs
 * (`drives.defaultDrives[].url`, `renown.switchboardUrl`) are token-able.
 * One definition, two schemas: `declaredHostSchema` (token-able fields take
 * output tokens; types host files) and `hostSchema` (resolved; checked
 * right before the verb). */
const schemas = defineHostSchemas((s) =>
  s.reactorHostSchema
    .extend({
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
          /** The switchboard this Connect is served next to: its server
           * (dev and serve) proxies the switchboard's paths (`/graphql`,
           * `/d/*`, `/attachments`, `/mcp`, `/api/*`) to `target`, and the
           * served config names that switchboard as `${origin}`, resolved by
           * the browser against the page's origin. So one config holds from
           * the developer's `localhost` and from a published site alike, with
           * every call on the page's own origin. Typically a sibling's
           * `origin` output token. */
          proxy: z.strictObject({ target: s.tokenable(z.url()) }).optional(),
          /** Files served by name, `{ "/<path>": "<file>" }`: each path under
           * the app's base answers with its file as it reads at that request
           * (another process may rewrite it), `Cache-Control: no-store`; a
           * missing file is a 404, never the app. The file is read against
           * the working directory (the project); `${package}` names the
           * package's own. Every Connect server serves them (dev and serve). */
          serveFiles: z.record(servedFilePath, z.string().min(1)).optional(),
          /** Sign-in by link (F3d): a loopback endpoint that signs this
           * computer's pages in as the person's own identity, and a link
           * with a one-time code printed and opened at start. On by default
           * at `dev`; `serve` needs it set. `sessions`: the data-folder
           * sessions (labels) the endpoint also issues for, for a key whose
           * password nobody can ask for them (the Studio agent). */
          localSignIn: z
            .union([
              z.boolean(),
              z.strictObject({
                sessions: z.array(z.string().min(1)).optional(),
              }),
            ])
            .optional(),
          /** Plugins of this host's dev server, which only the `dev` verb
           * loads: each default-exports a `ConnectDevPlugin` (host-core).
           * The entries join the dev server's default ones, and
           * `enabled: false` turns one of those off. */
          devPlugins: z.array(pluginEntrySchema).optional(),
        })
        .strict(),
      config: connectConfigSchemaWith(s.tokenable).optional(),
    })
    .superRefine(refineConnectReactor),
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
  /** Set when this Connect signs pages in by link; `open`: as asked. The
   * secret is never an output: a compound keeps it in its record. */
  localSignIn: z.strictObject({ open: z.boolean().optional() }).optional(),
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
export interface ListeningServer {
  resolvedUrls: { local: string[] } | null;
  close(): Promise<void>;
}

/** A started Connect as a runner handle. vite has already listened when the
 * service returns, so `ready` is settled; the outputs carry the URL vite
 * resolved (the port it actually bound), falling back to the requested one. */
export function connectHandle(
  server: ListeningServer,
  requested: { host: string; port: number },
  signIn?: LocalSignInPlan,
): RunnerHandle<ConnectOutputs> {
  const fallback = `http://${requested.host}:${requested.port}/`;
  const app = server.resolvedUrls?.local[0] ?? fallback;
  let closing: Promise<void> | undefined;
  if (signIn?.announce) announceSignIn(app, signIn);
  return {
    outputs: outputsSchema.parse({
      origin: new URL(app).origin,
      endpoints: { connect: app },
      ...(signIn
        ? {
            localSignIn: signIn.open === undefined ? {} : { open: signIn.open },
          }
        : {}),
    }),
    ready: Promise.resolve(),
    shutdown: () => (closing ??= server.close()),
  };
}

/** Makes the issuer of a sign-in endpoint (`@renown/sdk/local-sign-in`):
 * ph-cli's runner has it, a packaged app's ph-run does not. */
export type LocalSignInIssuerFactory = (o: {
  dataDir: string;
  sessions: readonly string[];
  env: Record<string, string | undefined>;
}) => Promise<LocalSignInIssuer>;

/** How a started Connect signs pages in by link. */
export interface LocalSignInPlan {
  secret: string;
  /** Print the link and open it here: nobody handed this runner the secret,
   * so nobody else announces it. */
  announce: boolean;
  /** As asked (`--open`, `runner.openBrowser`); unset: a terminal decides. */
  open?: boolean;
  /** The server's endpoint options. */
  endpoint: { secret: string; issuer: () => Promise<LocalSignInIssuer> };
}

/**
 * Whether this Connect signs pages in by link, and with what: on at `dev`
 * unless `runner.localSignIn` is false, at `serve` only when it is set. The
 * secret is the compound's (`PH_LOCAL_SIGN_IN_SECRET`), else made here.
 */
export function localSignInPlan(
  host: ConnectHostParsed,
  ctx: RunnerContext,
  o: {
    byDefault: boolean;
    open?: boolean;
    issuers: LocalSignInIssuerFactory | undefined;
  },
): LocalSignInPlan | undefined {
  const declared = host.runner.localSignIn;
  if (declared === false || (declared === undefined && !o.byDefault)) {
    return undefined;
  }
  const { issuers } = o;
  if (!issuers) {
    if (declared !== undefined) {
      console.warn(
        `[connect] hosts/${host.name}/host.js sets runner.localSignIn, but this runner cannot issue credentials: run it with @powerhousedao/ph-cli/runners/connect.`,
      );
    }
    return undefined;
  }
  const handed = ctx.env[LOCAL_SIGN_IN_SECRET_ENV];
  const secret = handed ?? newSignInSecret();
  const sessions =
    typeof declared === "object" ? (declared.sessions ?? []) : [];
  const dataDir = defaultUserDataDir(ctx.projectRoot, ctx.env);
  return {
    secret,
    announce: handed === undefined,
    ...(o.open === undefined ? {} : { open: o.open }),
    endpoint: {
      secret,
      issuer: () => issuers({ dataDir, sessions, env: ctx.env }),
    },
  };
}

/** Prints the sign-in link of the app at `appUrl`, and opens it as asked or
 * on a terminal. */
export function announceSignIn(
  appUrl: string,
  plan: Pick<LocalSignInPlan, "secret" | "open">,
  open: (url: string) => void = openInBrowser,
): void {
  const link = signInLink(appUrl, plan.secret);
  console.log(`  ➜  Sign in: ${link}`);
  if (opensBrowser({ asked: plan.open, isTTY: process.stdout.isTTY })) {
    open(link);
  }
}

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
        // Only a declared name: Connect writes a default drive's name into
        // the drive, and the slug fallback would rename the served one.
        ...(declaration.name ? { name: declaration.name } : {}),
        icon: drive.icon ?? null,
      };
    }
    return {
      local: true as const,
      // A local drive is skipped on later boots by this id, so it stays fixed.
      id: drive.id ?? drive.slug,
      name: drive.name,
      icon: drive.icon ?? null,
      ...(drive.preferredEditor ? { app: drive.preferredEditor } : {}),
    };
  });
}

/**
 * The served override. With `runner.proxy`, every URL on the proxied
 * switchboard's origin (drives, backends, plugin configs, however they were
 * written or resolved from output tokens) is served as `${origin}…`: the
 * browser reaches the switchboard through the page's own origin, which this
 * Connect's server proxies, so the config holds wherever the page is loaded
 * from. A host may also write `${origin}/…` itself; that passes through.
 */
export function callerOverride(
  host: ConnectHostParsed,
  ctx?: RunnerContext,
  verb = "dev",
): PHConnectRuntimeConfig | undefined {
  const override = callerOverrideRaw(host, ctx, verb);
  const target = host.runner.proxy?.target;
  return override && target
    ? withOriginPlaceholders(override, target)
    : override;
}

function callerOverrideRaw(
  host: ConnectHostParsed,
  ctx?: RunnerContext,
  verb = "dev",
): PHConnectRuntimeConfig | undefined {
  // A copy: the projection below adds served-only keys (composition, …).
  const base: PHConnectRuntimeConfig = { ...host.config };
  const reactor: ReactorConfig | undefined = host.reactor;

  // The Renown instance a person chose at start, under the names the
  // switchboard reads, so the two can't disagree.
  const renownUrl = ctx?.env.RENOWN_URL?.trim();
  const renownSwitchboardUrl = ctx?.env.SWITCHBOARD_URL?.trim();
  if (renownUrl || renownSwitchboardUrl) {
    base.renown = {
      ...base.renown,
      ...(renownUrl ? { url: renownUrl } : {}),
      ...(renownSwitchboardUrl ? { switchboardUrl: renownSwitchboardUrl } : {}),
    };
  }

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
  // Still served, and gone in the next release.
  for (const deprecation of [
    connectChromeDeprecation(
      host.config,
      entries !== undefined,
      `hosts/${host.name}/host.js`,
    ),
  ]) {
    if (deprecation) console.warn(deprecation);
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
  const unserved = unservedConnectStorage(reactor);
  if (unserved)
    console.warn(`[connect] hosts/${host.name}/host.js: ${unserved}`);
  const structural = isStructuralMultiReactor(reactor);
  if (!connect.reactor && !connect.instance && !structural) {
    // `base` IS host.config when the host has one; a host without a config
    // block still carries its composition, drives, Renown and namespace (set
    // on `base` above). With none of them, there is no override. `dev` and
    // `serve` add the default composition to whatever this returns; a build
    // bakes none, and Connect works the same one out when it boots.
    return host.config !== undefined ||
      composition ||
      declaredDefaults ||
      base.renown !== undefined ||
      base.instance !== undefined
      ? base
      : undefined;
  }
  const projected = structural
    ? projectDrivesIntoConnect({
        createdDriveUrls: remoteBackendUrls(reactor),
        configuredDefaultDrives: base.drives?.defaultDrives,
      }).drives
    : base.drives;
  const placed = placeConnectDrives(reactor, projected?.defaultDrives ?? []);
  const drives =
    projected?.defaultDrives === undefined
      ? projected
      : { ...projected, defaultDrives: placed.defaultDrives };
  // When the host DECLARES backends, instance facts derive from them and win
  // over config defaults (declaring `kind: "worker"` is more explicit intent
  // than a scaffold's `reactorWorker: false`); without backends the P2 rule
  // stands — an explicit connect.* value wins over descriptive projection.
  const declaresBackends = Object.keys(reactor?.backends ?? {}).length > 0;
  const instance = declaresBackends
    ? {
        ...base.instance,
        ...connect.instance,
        ...(placed.collections ? { collections: placed.collections } : {}),
      }
    : { ...connect.instance, ...base.instance };
  return {
    ...base,
    reactor: { ...connect.reactor, ...base.reactor },
    instance: instance as never,
    app: { ...base.app },
    ...(drives ? { drives: { ...base.drives, ...drives } } : {}),
  };
}

/** Whether the host leaves its composition to Connect's default, which the
 * terminal is told in place of a composition plan. */
export function servesDefaultComposition(host: ConnectHostParsed): boolean {
  if (host.runner.plugins !== undefined) return false;
  console.log(
    `[connect] hosts/${host.name}/host.js declares no runner.plugins: serving Connect's default composition.`,
  );
  return true;
}

/**
 * `override` with Connect's default composition, for a host that declares no
 * `runner.plugins` and is served by a build tool. The composition is worked
 * out from the config Connect would be served without one: the project's
 * powerhouse.config.json (`source`) under the override, under what the
 * service lays over both (`over`: Studio's studio mode).
 */
export function withDefaultComposition(
  override: PHConnectRuntimeConfig | undefined,
  source: Pick<PowerhouseConfig, "connect" | "workflows">,
  over: PHConnectRuntimeConfig = {},
): PHConnectRuntimeConfig {
  const served = deepMerge(
    deepMerge(resolveSourceConnect(source), override ?? {}),
    over,
  );
  return { ...override, composition: defaultConnectComposition(served) };
}

/**
 * Start a server; under a supervising compound (`ctx.parent`), drop the
 * process-exiting signal listeners it installed (vite's dev and preview
 * servers exit on SIGTERM): the compound owns the exit and stops members in
 * reverse dependency order through their handles.
 */
export async function startUnderSupervisor<T>(
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
export async function validateComposition(
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

/** What a Connect accepts after `ph run <host> [verb]`: the classic
 * `ph connect studio` definitions of the same names. */
const invocationArgs = {
  port: connectStudioArgs.port,
  host: commonServerArgs.host,
  open: commonServerArgs.open,
  cors: commonServerArgs.cors,
  strictPort: commonServerArgs.strictPort,
};

const invocation = command({
  name: "connect",
  args: invocationArgs,
  handler: (args) => args,
});

export type ConnectInvocationArgs = Partial<ParsedCmdResult<typeof invocation>>;

/** What the `build` verb accepts instead: the `ph connect build` definitions
 * of the same names. A container image sets these per build (its Docker
 * build arguments), so they are arguments and not host file keys. */
const buildInvocationArgs = {
  connectBasePath: connectBuildArgs.connectBasePath,
  packagesRegistry: connectBuildArgs.packagesRegistry,
};

const buildInvocation = command({
  name: "connect build",
  args: buildInvocationArgs,
  handler: (args) => args,
});

export type ConnectBuildInvocationArgs = Partial<
  ParsedCmdResult<typeof buildInvocation>
>;

const WATCH_RETIRED = "it is no longer needed.";

// One schema for the runner: each verb parses its own arguments, and so
// refuses the ones of another verb (`--base` on dev, `--port` on build).
export const argsSchema = runnerArgsSchemaOf(
  { ...invocationArgs, ...buildInvocationArgs },
  {
    // `ph dev --connect-port`
    memberOptions: { "--connect-port": "--port" },
    retired: { "--watch": WATCH_RETIRED, "-w": WATCH_RETIRED },
  },
);

/** This invocation's arguments (`ctx.argv`), parsed by the classic
 * definitions; only the ones passed. They win over the host file. */
export async function connectInvocationArgs(
  host: ConnectHostParsed,
  ctx: RunnerContext,
): Promise<ConnectInvocationArgs> {
  const argv = [...(ctx.argv ?? [])];
  if (argv.length === 0) return {};
  const result = await runSafely(invocation, argv);
  if (result._tag === "error") {
    throw new RunnerError(
      `hosts/${host.name}/host.js: ${result.error.config.message}`,
    );
  }
  return onlyPassed(result.value, invocationArgs, argv);
}

/** The `build` verb's arguments (`ctx.argv`), parsed by the classic
 * definitions; only the ones passed. They win over the host file. */
export async function connectBuildInvocationArgs(
  host: ConnectHostParsed,
  ctx: RunnerContext,
): Promise<ConnectBuildInvocationArgs> {
  const argv = [...(ctx.argv ?? [])];
  if (argv.length === 0) return {};
  const result = await runSafely(buildInvocation, argv);
  if (result._tag === "error") {
    throw new RunnerError(
      `hosts/${host.name}/host.js: ${result.error.config.message}`,
    );
  }
  return onlyPassed(result.value, buildInvocationArgs, argv);
}

/** A server for a built Connect, given what to serve and how. */
export type ConnectServerStart = (
  args: ConnectPreviewArgs,
  override?: ConnectServeOverride,
  dirname?: string,
  options?: {
    proxy?: string;
    serveFiles?: Readonly<Record<string, string>>;
    localSignIn?: LocalSignInPlan["endpoint"];
  },
) => Promise<ListeningServer>;

/** `serve` on a given server. The host's connect config (including a
 * supervising compound's projected drives and the reactor projection) rides a
 * serve override: the baked powerhouse.config.json merges with it at request
 * time, and `runner.cspRegistrySync` (set by the compound's wiring) patches the
 * baked CSP's script-src for the runtime registry. Together these replace the
 * ph-win-desktop sidecar's hand-rolled static server (desktop shape). */
export async function serveWith(
  start: ConnectServerStart,
  host: ConnectHostParsed,
  ctx: RunnerContext,
  options: { issuers?: LocalSignInIssuerFactory } = {},
): Promise<RunnerHandle<ConnectOutputs>> {
  await validateComposition(host, ctx);
  const runner = host.runner;
  const passed = await connectInvocationArgs(host, ctx);
  // A served Connect answers where its Studio does, not on `ph connect
  // preview`'s own default port.
  const port = passed.port ?? runner.port ?? DEFAULT_CONNECT_STUDIO_PORT;
  const bind = passed.host ?? runner.host ?? "127.0.0.1";
  const askedOpen = passed.open ?? runner.openBrowser;
  const signIn = localSignInPlan(host, ctx, {
    byDefault: false,
    ...(askedOpen === undefined ? {} : { open: askedOpen }),
    issuers: options.issuers,
  });
  // The classic `ph connect preview` arguments, with the keys this host and
  // this invocation own laid over them.
  const classic = await connectPreviewServiceArgs();
  const args: ConnectPreviewArgs = {
    ...classic,
    port,
    outDir: runner.outDir ?? classic.outDir,
    // With sign-in, the link is opened, not the bare app.
    open: signIn ? false : askedOpen === true,
    strictPort: passed.strictPort ?? runner.strictPort === true,
    cors: passed.cors ?? true,
    bindCLIShortcuts: false,
    // Explicit IPv4 loopback (runner.host overrides): vite's default
    // "localhost" can bind ::1 only on Windows, and a supervising shell
    // (ph-win) probes 127.0.0.1 — the sidecar this replaces bound 127.0.0.1.
    host: bind,
  };
  const override = withoutBuiltImages(callerOverride(host, ctx, ctx.verb));
  // Without `runner.plugins` the server adds the default composition to the
  // config it serves, worked out from the build's config under this override.
  const defaultComposition = servesDefaultComposition(host);
  const server = await startUnderSupervisor<ListeningServer>(ctx, () =>
    start(
      args,
      {
        connect: override,
        cspRegistrySync: runner.cspRegistrySync === true,
        ...(defaultComposition ? { defaultComposition } : {}),
      },
      undefined,
      {
        proxy: runner.proxy?.target,
        ...(runner.serveFiles ? { serveFiles: runner.serveFiles } : {}),
        ...(signIn ? { localSignIn: signIn.endpoint } : {}),
      },
    ),
  );
  return connectHandle(server, { host: bind, port }, signIn);
}

/** Serves a built Connect (run `build` first) with nothing but what a running
 * app has. ph-cli's runner adds the verbs that need build tools, and the
 * issuer of sign-in by link. */
export async function serve(
  host: ConnectHostParsed,
  ctx: RunnerContext,
  options: { issuers?: LocalSignInIssuerFactory } = {},
): Promise<RunnerHandle<ConnectOutputs>> {
  const { runConnectServer } = await import("../services/connect-server.js");
  return serveWith(runConnectServer, host, ctx, options);
}

/** With no Studio here, running Connect is serving its build. */
export const run = serve;

export const verbs = ["run", "serve"];
