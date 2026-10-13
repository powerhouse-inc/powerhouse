import {
  compoundHostSchema,
  getVerb,
  loadHost,
  resolveRunnerModule,
  validateHost,
  type HostDefinition,
  type RunnerContext,
} from "@powerhousedao/host-core";
import { bundleStack } from "./bundle-stack.js";
import {
  launchShell,
  resolveShell,
  shellEnv,
  type ShellOptions,
} from "./shell.js";

/**
 * @powerhousedao/desktop/runner (phase 6): the desktop host productized.
 *
 * - `run`/`serve`: the headless stack — byte-identical delegation to
 *   host-core's generic compound (phase-3 semantics unchanged).
 * - `dev`: the NATIVE window — resolves the shell (runner.shell.project /
 *   PH_DESKTOP_SHELL), wires the env trio itself (PH_RUN_PROJECT, PH_RUN_CLI,
 *   PH_WIN_CONNECT_PORT, + userData/flag) and launches the built exe when one
 *   exists, else `pnpm tauri dev` with the shell-config projection (D6.d).
 * - `build`: the PACKAGING verb — forwards `build` to members that export it
 *   (skipping the rest WITH a log line: packaging builds what is buildable,
 *   unlike the generic compound's uniform fail-loud forwarding), then stages
 *   the shippable stack into the shell project (bundle-stack: hosts + config
 *   + built Connect + vendored ph-cli) so the installed app runs with no
 *   environment at all (D6.c).
 */

export const kind = "compound";

export const hostSchema = compoundHostSchema;

interface DesktopRunnerOptions {
  shell?: ShellOptions;
  /** build: vendor ph-cli into the staged stack (default true). */
  vendorStack?: boolean;
  /** build: the ph-cli version/tag to vendor (default "dev"). */
  phCliVersion?: string;
  /** build: full install spec override (e.g. a pnpm-pack tarball path) for a
   * ph-cli not yet on the registry. */
  phCliSpec?: string;
}

interface ChildWrapper {
  host: string;
  runner?: { port?: number; defaultVerb?: string } & Record<string, unknown>;
}

async function compoundModule() {
  return import("@powerhousedao/host-core/runners/compound");
}

/** The connect member's port — the shell's readiness probe and window URL. */
async function connectPort(
  host: HostDefinition,
  ctx: RunnerContext,
): Promise<number> {
  const children = (host.children ?? {}) as Record<string, ChildWrapper>;
  for (const wrapper of Object.values(children)) {
    if (wrapper.host !== "connect") continue;
    if (typeof wrapper.runner?.port === "number") return wrapper.runner.port;
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

export async function run(host: HostDefinition, ctx: RunnerContext) {
  const compound = await compoundModule();
  return compound.run(host, ctx);
}

export const serve = run;

/** dev = the native window around the live stack, zero manual env. */
export interface ShellHandle {
  /** Resolves when the shell window exits — the runner's keep-alive. */
  ready: Promise<void>;
  shutdown: () => void;
}

export async function dev(
  host: HostDefinition,
  ctx: RunnerContext,
): Promise<ShellHandle> {
  const options = host.runner as { shell?: ShellOptions };
  const shell = resolveShell(ctx.projectRoot, options.shell, ctx.env);
  const port = await connectPort(host, ctx);
  const envVars = shellEnv(ctx.projectRoot, port, ctx.env);

  console.log(
    `[${host.name}] launching the desktop shell ` +
      `(${shell.exe ? shell.exe : "pnpm tauri dev"}) — stack via ` +
      `ph run ${host.name}, window at http://127.0.0.1:${port}/`,
  );
  const child = launchShell(shell, envVars, options.shell);
  const exited = new Promise<void>((resolve) =>
    child.once("exit", () => resolve()),
  );

  return {
    // keep the runner alive as long as the window lives
    ready: exited,
    shutdown: () => {
      try {
        child.kill();
      } catch {
        // already gone
      }
    },
  };
}

/** build = members' builds (where exported) + the shippable stack staging. */
export async function build(
  host: HostDefinition,
  ctx: RunnerContext,
): Promise<void> {
  const children = (host.children ?? {}) as Record<string, ChildWrapper>;
  for (const [name, wrapper] of Object.entries(children)) {
    const member = await loadHost(ctx.projectRoot, wrapper.host);
    const specifier = member.host.runner.module;
    const runner = await resolveRunnerModule(ctx.projectRoot, specifier);
    validateHost(
      runner,
      specifier,
      member.host,
      `hosts/${wrapper.host}/host.js`,
    );
    if (typeof (runner as Record<string, unknown>).build !== "function") {
      console.log(
        `[${host.name}] build: ${name} (${wrapper.host}) exports no build — skipped (packaging builds what is buildable)`,
      );
      continue;
    }
    const fn = getVerb(runner, specifier, "build");
    console.log(`[${host.name}] build → ${name} (${wrapper.host})`);
    await fn(member.host, { ...ctx, verb: "build" });
  }

  const runnerOptions = host.runner as DesktopRunnerOptions &
    HostDefinition["runner"];
  if (!runnerOptions.shell?.project && !ctx.env.PH_DESKTOP_SHELL) {
    console.log(
      `[${host.name}] build: no shell configured — members built; stack ` +
        `staging skipped (set runner.shell.project to stage the shippable stack).`,
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
    connectPort: await connectPort(host, ctx),
  });
  console.log(
    `[${host.name}] stack staged at ${result.stackDir}` +
      `${result.vendored ? " (ph-cli vendored)" : ""} — the shell runs it with ` +
      `no environment (resources fallback).`,
  );
}
