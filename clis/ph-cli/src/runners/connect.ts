import {
  callerOverride,
  connectHandle,
  connectInvocationArgs,
  serve as serveBuilt,
  servesDefaultComposition,
  serveWith,
  startUnderSupervisor,
  validateComposition,
  withDefaultComposition,
  type ConnectHostParsed,
  type ConnectInvocationArgs,
  type ConnectOutputs,
} from "@powerhousedao/ph-run/runners/connect";
import type { RunnerContext, RunnerHandle } from "@powerhousedao/host-core";
import { getConfig } from "@powerhousedao/shared/clis";
import { join } from "node:path";
import type { ConnectStudioArgs } from "../types.js";

export * from "@powerhousedao/ph-run/runners/connect";

export const verbs = ["run", "dev", "build", "serve"];

/** The Connect studio arguments, with the keys this host and
 * this invocation own laid over them. An argument of this invocation
 * (`passed`) wins over the host file. */
async function toStudioArgs(
  host: ConnectHostParsed,
  passed: ConnectInvocationArgs,
): Promise<ConnectStudioArgs> {
  const { connectStudioServiceArgs } =
    await import("../services/service-args.js");
  const classic = await connectStudioServiceArgs();
  const runner = host.runner;
  return {
    ...classic,
    port: passed.port ?? runner.port ?? classic.port,
    // The bind address (runnerBaseSchema `host`); unset keeps vite's default.
    host: passed.host ?? runner.host ?? classic.host,
    open: passed.open ?? runner.openBrowser === true,
    strictPort: passed.strictPort ?? runner.strictPort === true,
    cors: passed.cors ?? classic.cors,
    bindCLIShortcuts: false,
  };
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
  const args = await toStudioArgs(host, await connectInvocationArgs(host, ctx));
  const studio: { stop?: () => Promise<void> } = {};
  const override = callerOverride(host, ctx, ctx.verb);
  // Without `runner.plugins`, the default composition: worked out at each
  // start of Studio from the powerhouse.config.json it reads, with the
  // studio mode it always switches on.
  const served = servesDefaultComposition(host)
    ? () =>
        withDefaultComposition(
          override,
          getConfig(join(process.cwd(), "powerhouse.config.json")),
          { app: { studioMode: true } },
        )
    : override;
  const server = await startUnderSupervisor(ctx, () =>
    runConnectStudio(args, undefined, served, {
      routes: host.runner.routes,
      cacheDir: viteCacheOf(host, ctx),
      proxy: host.runner.proxy?.target,
      // As `ph connect studio` and `ph vetra` start it.
      reloadOnConfigChange: true,
      // A restart's server is started as the first is.
      restartWith: (start) => startUnderSupervisor(ctx, start),
      exposeStop: (stop) => {
        studio.stop = stop;
      },
    }),
  );
  // A config change replaces the first server: the handle stops Studio, which
  // is its watcher and whichever server is current.
  const current = {
    resolvedUrls: server.resolvedUrls,
    close: () => (studio.stop ? studio.stop() : server.close()),
  };
  // vite's dev server binds its default host ("localhost") here.
  return connectHandle(current, { host: "localhost", port: args.port });
}

/** `run` is dev-studio until the plugin phases give hosts a production
 * runtime; `serve` (below) is the static production server. */
export const run = dev;

/** `build`: the Connect build service (`ph connect build` is sugar for it). */
export async function build(
  host: ConnectHostParsed,
  ctx: RunnerContext,
): Promise<void> {
  await validateComposition(host, ctx);
  const { runConnectBuild } = await import("../services/connect-build.js");
  const { connectBuildServiceArgs } =
    await import("../services/service-args.js");
  const classic = await connectBuildServiceArgs();
  const args = {
    ...classic,
    // The default of the build arguments: `dist/` is the package `ph build` writes.
    outDir: host.runner.outDir ?? classic.outDir,
  };
  // The host's config bakes in: its title, favicon, manifest, base path and loading shell.
  await runConnectBuild(args, callerOverride(host, ctx, ctx.verb), {
    routes: host.runner.routes,
  });
}

/** Opening a browser is a developer's convenience, and vite's to give, which
 * also takes over under PH_CONNECT_SERVER=vite. Anything else needs no vite. */
export async function serve(
  host: ConnectHostParsed,
  ctx: RunnerContext,
): Promise<RunnerHandle<ConnectOutputs>> {
  const passed = await connectInvocationArgs(host, ctx);
  const open = passed.open ?? host.runner.openBrowser === true;
  if (!open && process.env.PH_CONNECT_SERVER !== "vite") {
    return serveBuilt(host, ctx);
  }
  const { runConnectPreview } = await import("../services/connect-preview.js");
  return serveWith(runConnectPreview, host, ctx);
}
