import {
  callerOverride,
  connectHandle,
  serve as serveBuilt,
  serveWith,
  startUnderSupervisor,
  validateComposition,
  type ConnectHostParsed,
  type ConnectOutputs,
} from "@powerhousedao/ph-run/runners/connect";
import {
  DEFAULT_CONNECT_OUTDIR,
  DEFAULT_CONNECT_STUDIO_PORT,
} from "@powerhousedao/shared/clis";
import type { RunnerContext, RunnerHandle } from "@powerhousedao/host-core";
import { join } from "node:path";
import type { ConnectBuildArgs, ConnectStudioArgs } from "../types.js";

export * from "@powerhousedao/ph-run/runners/connect";

export const verbs = ["run", "dev", "build", "serve"];

/** The studio arg surface is wide (commonArgs + server args); the service only
 * reads a known subset, and the repo's own tests build these objects the same
 * way (Partial + cast — see connect-build.test.ts `mk()`). */
function toStudioArgs(host: ConnectHostParsed): ConnectStudioArgs {
  const runner = host.runner;
  const args: Partial<ConnectStudioArgs> = {
    port: runner.port ?? DEFAULT_CONNECT_STUDIO_PORT,
    // The bind address (runnerBaseSchema `host`); unset keeps vite's default.
    ...(runner.host ? { host: runner.host } : {}),
    open: runner.openBrowser === true,
    strictPort: runner.strictPort === true,
    printUrls: true,
    bindCLIShortcuts: false,
  };
  return args as ConnectStudioArgs;
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
      proxy: host.runner.proxy?.target,
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
    // Classic `ph connect`'s default: `dist/` is the package `ph build` writes.
    outDir: host.runner.outDir ?? DEFAULT_CONNECT_OUTDIR,
  };
  // The host's config bakes in: its title, favicon, manifest, base path and loading shell.
  await runConnectBuild(
    args as ConnectBuildArgs,
    callerOverride(host, ctx, ctx.verb),
    { routes: host.runner.routes },
  );
}

/** Opening a browser is a developer's convenience, and vite's to give, which
 * also takes over under PH_CONNECT_SERVER=vite. Anything else needs no vite. */
export async function serve(
  host: ConnectHostParsed,
  ctx: RunnerContext,
): Promise<RunnerHandle<ConnectOutputs>> {
  if (
    host.runner.openBrowser !== true &&
    process.env.PH_CONNECT_SERVER !== "vite"
  ) {
    return serveBuilt(host, ctx);
  }
  const { runConnectPreview } = await import("../services/connect-preview.js");
  return serveWith(runConnectPreview, host, ctx);
}
