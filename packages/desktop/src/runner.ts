import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  compoundWiringSchema,
  getVerb,
  loadHost,
  refineStartOrder,
  resolveRunnerModule,
  validateHost,
  type RunnerContext,
  type RunnerHandle,
} from "@powerhousedao/host-core";
import { defineHostSchemas } from "@powerhousedao/host-core/schema";
import { z } from "zod";
import { APP_JSON_FILE, loadAppJson } from "./app-json.js";
import { bundleStack } from "./bundle-stack.js";
import { ICON_SOURCE, projectShell } from "./shell-project.js";
import {
  detectToolchain,
  fetchNodeSidecar,
  preflightOrThrow,
  runTauriIcon,
  tauriBundlesForHost,
  tauriSpawn,
  type TauriCommand,
} from "./shell-toolchain.js";
import { launchShell, resolveShell, shellEnv } from "./shell.js";

/**
 * @powerhousedao/desktop/runner.
 *
 * - `run`/`serve`: the headless stack — byte-identical delegation to
 *   host-core's generic compound (phase-3 semantics unchanged).
 * - `dev`: the NATIVE window. Mode 1 (phase 7) is the default — a builder
 *   ships under THEIR identity by editing `hosts/<host>/app.json` and never
 *   writing Rust: the runner projects app.json into a generated `tauri-shell/`
 *   that depends on the published `ph-desktop-shell` crate, provisions the
 *   native toolchain's compile-time inputs (node sidecar + icon set), and runs
 *   `cargo tauri dev`. An explicit `runner.shell.project` (or PH_DESKTOP_SHELL)
 *   still selects a prebuilt/hand-maintained shell instead.
 * - `build`: the PACKAGING verb — members' builds (where exported), then the
 *   shippable stack staged into the shell + `cargo tauri build` with
 *   host-appropriate installer targets (nsis / app+dmg / deb+appimage).
 *
 * The native toolchain is required ONLY for dev/build; a missing cargo or
 * Tauri CLI fails with install guidance (see shell-toolchain). `ph run <host>`
 * (headless) needs none of it.
 */

export const kind = "compound";

/** The verbs this runner exports (`shellMode` is a helper). */
export const verbs = ["run", "serve", "dev", "build"] as const;

/** `runner.shell`: a prebuilt or hand-maintained shell (mode 2). Mirrors
 * `ShellOptions` (shell.ts); a type test pins the two together. */
export const shellOptionsSchema = z.strictObject({
  /** Path to a ph-win-desktop checkout (absolute or project-relative). */
  project: z.string().min(1).optional(),
  window: z
    .strictObject({
      title: z.string().optional(),
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
    })
    .optional(),
  tray: z.boolean().optional(),
  fileAssociations: z.array(z.string().min(1)).optional(),
});

/**
 * The desktop host, from one definition in two forms: DECLARED (what host.js
 * authors write) and RESOLVED (what the verbs receive). The runner adds no
 * token-able fields of its own; the forms differ in host-core's base blocks
 * (member wrappers' reactor URLs and the like).
 */
const schemas = defineHostSchemas((base) => {
  /** The desktop runner's own `runner` options, on top of the common base. */
  const desktopRunnerOptionsSchema = base.runnerBaseSchema
    .extend({
      shell: shellOptionsSchema.optional(),
      /** build: vendor ph-cli into the staged stack (default true). */
      vendorStack: z.boolean().optional(),
      /** build: the ph-cli version/tag to vendor (default "dev"). */
      phCliVersion: z.string().min(1).optional(),
      /** build: full install spec override (e.g. a pnpm-pack tarball path)
       * for a ph-cli not yet on the registry. */
      phCliSpec: z.string().min(1).optional(),
    })
    .strict();

  /** The generic compound's wiring config plus the shell and packaging
   * options. Extend the unrefined base, refine last (zod refuses to extend
   * a refined object). */
  return base.compoundHostSchema
    .extend({
      runner: desktopRunnerOptionsSchema,
      config: compoundWiringSchema.optional(),
    })
    .superRefine(refineStartOrder);
});

/** Declared form: what a host file may contain before resolution. */
export const declaredHostSchema = schemas.declaredHostSchema;
/** Resolved form: what the verbs receive (and `validateHost` checks). */
export const hostSchema = schemas.hostSchema;

/** What a desktop host.js author writes. */
export type DesktopHostInput = z.input<typeof declaredHostSchema>;
/** What the verbs receive. */
export type DesktopHost = z.output<typeof hostSchema>;

/** The desktop compound produces nothing of its own: what its members
 * produce stays with the members (the compound's handles, the run record's
 * `members`). */
export const outputsSchema = z.strictObject({});

export type DesktopOutputs = z.infer<typeof outputsSchema>;

declare global {
  interface PHHostRunners {
    "@powerhousedao/desktop/runner": {
      host: DesktopHostInput;
      outputs: DesktopOutputs;
    };
  }
}

export type DesktopHandle = RunnerHandle<DesktopOutputs>;

async function compoundModule() {
  return import("@powerhousedao/host-core/runners/compound");
}

/** hosts/<host>/ — where app.json lives and the generated shell is written. */
function hostDirOf(
  host: Pick<DesktopHost, "name">,
  ctx: RunnerContext,
): string {
  return path.join(ctx.projectRoot, "hosts", host.name);
}

/** The connect member's port — the shell's readiness probe and window URL. */
async function connectPort(
  host: DesktopHost,
  ctx: RunnerContext,
): Promise<number> {
  for (const wrapper of Object.values(host.children)) {
    if (wrapper.host !== "connect") continue;
    if (wrapper.runner?.port !== undefined) return wrapper.runner.port;
    const member = await loadHost(ctx.projectRoot, wrapper.host);
    if (typeof member.host.runner.port === "number") {
      return member.host.runner.port;
    }
  }
  throw new Error(
    `hosts/${host.name}: no connect member with a resolvable runner.port — ` +
      `the shell needs it for its readiness probe and window URL.`,
  );
}

export async function run(
  host: DesktopHost,
  ctx: RunnerContext,
): Promise<DesktopHandle> {
  const compound = await compoundModule();
  const started = await compound.run(host, ctx);
  return {
    outputs: outputsSchema.parse({}),
    // runCompound has already awaited every member's readiness.
    ready: Promise.resolve(),
    shutdown: started.shutdown,
  };
}

export const serve = run;

export interface ShellHandle extends DesktopHandle {
  /** Resolves when the shell window exits — the runner's keep-alive. */
  exited: Promise<void>;
}

/** The handle for a launched shell process: `ready` once it is spawned. */
function shellHandle(child: ChildProcess): ShellHandle {
  const exited = new Promise<void>((resolve) =>
    child.once("exit", () => resolve()),
  );
  return {
    outputs: outputsSchema.parse({}),
    ready: Promise.resolve(),
    exited,
    shutdown: () => {
      try {
        child.kill();
      } catch {
        // already gone
      }
      return Promise.resolve();
    },
  };
}

/** Which shell backs this host's native window (D7.d source order):
 * an explicit `runner.shell.project`, else the app.json-generated shell,
 * else the PH_DESKTOP_SHELL escape hatch. */
export function shellMode(
  host: Pick<DesktopHost, "name" | "runner">,
  ctx: RunnerContext,
): "external-project" | "generated" | "external-env" | "none" {
  if (host.runner.shell?.project) return "external-project";
  if (fs.existsSync(path.join(hostDirOf(host, ctx), APP_JSON_FILE))) {
    return "generated";
  }
  if (ctx.env.PH_DESKTOP_SHELL) return "external-env";
  return "none";
}

/** Fetch the node sidecar + (re)generate the icon set — both are tauri-build
 * COMPILE-TIME inputs (externalBin; icon.ico for the Windows resource),
 * confirmed against a live cargo check. Icon regen only when app-icon.png
 * changed or the set is absent. */
function provisionShell(
  shellDir: string,
  tauri: TauriCommand,
  iconChanged: boolean,
): void {
  fetchNodeSidecar(shellDir);
  const iconIco = path.join(shellDir, "icons", "icon.ico");
  if (iconChanged || !fs.existsSync(iconIco)) {
    runTauriIcon(tauri, shellDir, ICON_SOURCE);
  }
}

/** Spawn a `<tauri> <subcommand>` in the generated shell with the uniform-
 * runners env trio wired in. */
function spawnTauri(
  tauri: TauriCommand,
  subcommand: string[],
  shellDir: string,
  envVars: Record<string, string>,
) {
  const { command, args, shell } = tauriSpawn(tauri, subcommand);
  return spawn(command, args, {
    cwd: shellDir,
    env: { ...process.env, ...envVars },
    stdio: "inherit",
    shell,
    windowsHide: true,
  });
}

export async function dev(
  host: DesktopHost,
  ctx: RunnerContext,
): Promise<ShellHandle> {
  const mode = shellMode(host, ctx);
  if (mode === "none") {
    throw new Error(
      `hosts/${host.name}: no desktop shell to run — add ${APP_JSON_FILE} ` +
        `(run \`ph generate desktop-shell\`) for a builder-owned identity, set ` +
        `runner.shell.project to a prebuilt shell, or export PH_DESKTOP_SHELL.`,
    );
  }

  const port = await connectPort(host, ctx);
  const envVars = shellEnv(ctx.projectRoot, port, ctx.env);

  if (mode === "generated") {
    const hostDir = hostDirOf(host, ctx);
    const app = loadAppJson(hostDir);
    const { shellDir, binName, changed } = projectShell({
      hostDir,
      app,
      connectPort: port,
    });
    const tauri = preflightOrThrow(detectToolchain(ctx.projectRoot), host.name);
    provisionShell(shellDir, tauri, changed);
    console.log(
      `[${host.name}] launching the generated desktop shell '${binName}' ` +
        `(${tauri.via}: cargo tauri dev) — stack via ph run ${host.name}, ` +
        `window at http://127.0.0.1:${port}/`,
    );
    return shellHandle(spawnTauri(tauri, ["dev"], shellDir, envVars));
  }

  // external-project / external-env: a prebuilt or hand-maintained shell.
  const options = host.runner;
  const shell = resolveShell(ctx.projectRoot, options.shell, ctx.env);
  console.log(
    `[${host.name}] launching the desktop shell ` +
      `(${shell.exe ? shell.exe : "pnpm tauri dev"}) — stack via ` +
      `ph run ${host.name}, window at http://127.0.0.1:${port}/`,
  );
  return shellHandle(launchShell(shell, envVars, options.shell));
}

/** Forward `build` to members that export it (packaging builds what is
 * buildable — unlike the generic compound's uniform fail-loud forwarding). */
async function buildMembers(
  host: DesktopHost,
  ctx: RunnerContext,
): Promise<void> {
  for (const [name, wrapper] of Object.entries(host.children)) {
    const member = await loadHost(ctx.projectRoot, wrapper.host);
    const specifier = member.host.runner.module;
    const runner = await resolveRunnerModule(ctx.projectRoot, specifier);
    const validated = validateHost(
      runner,
      specifier,
      member.host,
      `hosts/${wrapper.host}/host.js`,
    );
    if (typeof runner.build !== "function") {
      console.log(
        `[${host.name}] build: ${name} (${wrapper.host}) exports no build — skipped (packaging builds what is buildable)`,
      );
      continue;
    }
    const fn = getVerb(runner, specifier, "build");
    console.log(`[${host.name}] build → ${name} (${wrapper.host})`);
    await fn(validated, {
      ...ctx,
      verb: "build",
      parent: { host: host.name, verb: ctx.verb },
    });
  }
}

/** build = members' builds + the shippable stack + the native installer. */
export async function build(
  host: DesktopHost,
  ctx: RunnerContext,
): Promise<void> {
  await buildMembers(host, ctx);

  const runnerOptions = host.runner;
  const mode = shellMode(host, ctx);
  const port = await connectPort(host, ctx);

  if (mode === "generated") {
    const hostDir = hostDirOf(host, ctx);
    const app = loadAppJson(hostDir);
    const { shellDir, binName, changed } = projectShell({
      hostDir,
      app,
      connectPort: port,
    });
    const tauri = preflightOrThrow(detectToolchain(ctx.projectRoot), host.name);
    provisionShell(shellDir, tauri, changed);

    console.log(`[${host.name}] staging the stack into ${shellDir}…`);
    const staged = bundleStack({
      projectRoot: ctx.projectRoot,
      shellProjectDir: shellDir,
      vendor: runnerOptions.vendorStack,
      phCliVersion: runnerOptions.phCliVersion,
      phCliSpec: runnerOptions.phCliSpec ?? ctx.env.PH_DESKTOP_PHCLI_SPEC,
      connectPort: port,
      // the generated shell lives under hosts/ — never stage it into itself
      excludeDirs: [shellDir],
    });
    console.log(
      `[${host.name}] stack staged at ${staged.stackDir}` +
        `${staged.vendored ? " (ph-cli vendored)" : ""}.`,
    );

    const bundles = tauriBundlesForHost();
    console.log(
      `[${host.name}] building '${binName}' (${tauri.via}: cargo tauri ` +
        `build --bundles ${bundles.join(",")})…`,
    );
    const result = spawnSyncTauri(
      tauri,
      ["build", "--bundles", bundles.join(",")],
      shellDir,
    );
    if (result !== 0) {
      throw new Error(
        `hosts/${host.name}: \`cargo tauri build\` failed (exit ${result}).`,
      );
    }
    console.log(
      `[${host.name}] desktop app built — installers under ` +
        `${path.join(shellDir, "target", "release", "bundle")}.`,
    );
    return;
  }

  // external-project / external-env: stage into the prebuilt shell (phase 6).
  if (mode === "none") {
    console.log(
      `[${host.name}] build: no shell configured — members built; shell ` +
        `packaging skipped (add ${APP_JSON_FILE} or set runner.shell.project).`,
    );
    return;
  }
  const shell = resolveShell(ctx.projectRoot, runnerOptions.shell, ctx.env);
  console.log(`[${host.name}] staging the stack into ${shell.projectDir}…`);
  const result = bundleStack({
    projectRoot: ctx.projectRoot,
    shellProjectDir: shell.projectDir,
    vendor: runnerOptions.vendorStack,
    phCliVersion: runnerOptions.phCliVersion,
    phCliSpec: runnerOptions.phCliSpec ?? ctx.env.PH_DESKTOP_PHCLI_SPEC,
    connectPort: port,
  });
  console.log(
    `[${host.name}] stack staged at ${result.stackDir}` +
      `${result.vendored ? " (ph-cli vendored)" : ""} — the shell runs it with ` +
      `no environment (resources fallback).`,
  );
}

/** Synchronous `<tauri> <subcommand>` — build blocks until the installer is
 * produced. Returns the exit code. */
function spawnSyncTauri(
  tauri: TauriCommand,
  subcommand: string[],
  shellDir: string,
): number {
  const { command, args, shell } = tauriSpawn(tauri, subcommand);
  const r = spawnSync(command, args, {
    cwd: shellDir,
    stdio: "inherit",
    shell,
    windowsHide: true,
  });
  return r.status ?? 1;
}
