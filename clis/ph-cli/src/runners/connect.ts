import {
  callerOverride,
  connectBuildInvocationArgs,
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
import { deepMerge } from "@powerhousedao/shared/connect";
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

// Per host: Studio and other hosts' dev servers run side by side in one
// project. A package's host has the package in front, joined by `+`, which
// no host name holds: `.vite-@acme+tools+connect`.
const viteCacheOf = (host: ConnectHostParsed, ctx: RunnerContext) =>
  join(
    ctx.projectRoot,
    "node_modules",
    ctx.hostPackage
      ? `.vite-${`${ctx.hostPackage.name}/${host.name}`.replace(/[^\w.@/-]/g, "_").replaceAll("/", "+")}`
      : `.vite-${host.name.replace(/[^\w.-]/g, "_")}`,
  );

export async function dev(
  host: ConnectHostParsed,
  ctx: RunnerContext,
): Promise<RunnerHandle<ConnectOutputs>> {
  await validateComposition(host, ctx);
  const { runConnectStudio } = await import("../services/connect-studio.js");
  const args = await toStudioArgs(host, await connectInvocationArgs(host, ctx));
  const studio: { stop?: () => Promise<void> } = {};
  // A host file projects powerhouse.config.json, so a change of that file
  // changes the host: each restart of Studio serves the host as it reads
  // then. Its port, routes, proxy and served files stay those of the start.
  let override = callerOverride(host, ctx, ctx.verb);
  const { reloadHost } = ctx;
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
    : reloadHost
      ? () => override
      : override;
  const server = await startUnderSupervisor(ctx, () =>
    runConnectStudio(args, undefined, served, {
      routes: host.runner.routes,
      cacheDir: viteCacheOf(host, ctx),
      proxy: host.runner.proxy?.target,
      // Served as a build's servers serve them: a Studio's tab reads them
      // in dev too.
      ...(host.runner.serveFiles ? { serveFiles: host.runner.serveFiles } : {}),
      // As `ph connect studio` and `ph dev` start it.
      reloadOnConfigChange: true,
      ...(reloadHost
        ? {
            beforeRestart: async () => {
              const reread = (await reloadHost()) as ConnectHostParsed;
              override = callerOverride(reread, ctx, ctx.verb);
            },
          }
        : {}),
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
  const passed = await connectBuildInvocationArgs(host, ctx);
  const args = {
    ...classic,
    // The default of the build arguments: `dist/` is the package `ph build` writes.
    outDir: host.runner.outDir ?? classic.outDir,
    // `--packages-registry`: the top-level packageRegistryUrl of the build.
    packagesRegistry: passed.packagesRegistry ?? classic.packagesRegistry,
    connectBasePath: passed.connectBasePath ?? classic.connectBasePath,
  };
  // The host's config bakes in: its title, favicon, manifest, base path and loading shell.
  const hostConfig = callerOverride(host, ctx, ctx.verb);
  // `--base` wins over the host file, as an argument does: connect.app.basePath,
  // where `ph connect build --base` put it. Laid over the host's config here
  // too, as the service reads the flag off the command line of the process.
  const override =
    passed.connectBasePath === undefined
      ? hostConfig
      : deepMerge(hostConfig ?? {}, {
          app: { basePath: passed.connectBasePath },
        });
  await runConnectBuild(args, override, {
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
