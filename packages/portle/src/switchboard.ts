import type { HostPlugin } from "@powerhousedao/host-core";
import type { ISubgraph } from "@powerhousedao/reactor-api";
import { bootGatePasses } from "./gate.js";
import { PortleRunner, type PortleRunnerLike } from "./runner.js";
import { projectRootOf, stateDirOf } from "./state.js";
import {
  createPortleSubgraph,
  gateFactsOf,
  type PortleApi,
} from "./subgraph.js";

/**
 * Portle, server side: the host plugin that lets a project publish itself
 * through the Portle relay. Listed in the project's switchboard host file
 * (`runner.plugins`); presence is activation, and it takes no config.
 *
 * It mounts the `portle` subgraph (readiness, status, enrol, configure,
 * start, stop) and owns the tunnel: frpc and Caddy run as its supervised
 * children, come up at boot only when the operator asked for it AND the
 * publication gate passes, and go down with the switchboard. The gate and
 * the thing it guards share one owner, so "published" implies "locked down".
 */

/**
 * The slice of the switchboard's plugin context this plugin reads. The
 * switchboard does not export its context type; these are the fields it
 * documents as set by the time the hooks fire.
 */
export interface PortleHostContext {
  options?: Record<string, unknown>;
  logger?: unknown;
  api?: unknown;
  graphqlManager?: unknown;
  /** Late subgraph registrations drain before the readiness router update. */
  lateSubgraphs?: Promise<unknown>[];
  /** Set by this plugin at onSubgraphsRegistering. */
  portle?: { runner: PortleRunnerLike };
}

interface SubgraphRegistry {
  registerSubgraphInstance(
    subgraph: ISubgraph,
    supergraph?: string,
    core?: boolean,
  ): Promise<unknown>;
}

interface LoggerLike {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
}

function loggerOf(ctx: PortleHostContext): LoggerLike {
  const logger = ctx.logger as Partial<LoggerLike> | undefined;
  if (
    logger &&
    typeof logger.info === "function" &&
    typeof logger.warn === "function"
  ) {
    return logger as LoggerLike;
  }
  return {
    info: (m, ...a) => console.log(`[portle] ${m}`, ...a),
    warn: (m, ...a) => console.warn(`[portle] ${m}`, ...a),
  };
}

export interface PortleHooks {
  onSubgraphsRegistering: (ctx: PortleHostContext) => Promise<void>;
  onDrivesReady: (ctx: PortleHostContext) => Promise<void>;
  onShutdown: (ctx: PortleHostContext) => Promise<void>;
}

export const PORTLE_PLUGIN_NAME = "portle";

/** Injected by tests; the real plugin builds a PortleRunner on the project's state dir. */
export function createPortlePlugin(
  makeRunner: (stateDir: string, log: LoggerLike) => PortleRunnerLike = (
    stateDir,
    log,
  ) =>
    new PortleRunner({
      stateDir,
      log: (msg, detail) =>
        log.info(`[portle] ${msg} ${detail ? JSON.stringify(detail) : ""}`),
    }),
): HostPlugin<PortleHooks> {
  return {
    name: PORTLE_PLUGIN_NAME,
    appliesTo: "switchboard",
    hooks: {
      onSubgraphsRegistering: async (ctx) => {
        const api = ctx.api as PortleApi | undefined;
        const registry = ctx.graphqlManager as SubgraphRegistry | undefined;
        if (!api || !registry) {
          throw new Error(
            "The portle plugin needs the switchboard's API and GraphQL manager at onSubgraphsRegistering; the host handed neither.",
          );
        }
        const log = loggerOf(ctx);
        const runner = makeRunner(stateDirOf(projectRootOf(ctx.options)), log);
        ctx.portle = { runner };
        const registration = registry.registerSubgraphInstance(
          createPortleSubgraph({ api, runner }),
          "graphql",
          false,
        );
        (ctx.lateSubgraphs ??= []).push(registration);
        await Promise.resolve();
      },
      // The last boot hook: the subgraph is mounted and the drives are seeded.
      onDrivesReady: async (ctx) => {
        const runner = ctx.portle?.runner;
        const api = ctx.api as PortleApi | undefined;
        if (!runner || !api) return;
        const log = loggerOf(ctx);
        const status = runner.status();
        if (!status.enrolled || !status.settings?.autostart) return;
        const facts = gateFactsOf(api);
        if (!bootGatePasses(facts)) {
          log.warn(
            "[portle] the tunnel stays down: this host no longer passes the publication gate (see portleReadiness). Lock it down again or stop publishing.",
          );
          return;
        }
        try {
          await runner.start();
          log.info(`[portle] tunnel up for ${status.siteZone}`);
        } catch (error) {
          log.warn(
            `[portle] the tunnel could not start: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
      onShutdown: async (ctx) => {
        const runner = ctx.portle?.runner;
        if (!runner) return;
        const status = runner.status();
        if (status.tunnel.state === "down") return;
        // Stop the processes, but keep `autostart` as the operator left it.
        await runner.stop();
        if (status.settings?.autostart) runner.configure({});
      },
    },
  };
}

export const portleSwitchboardPlugin: HostPlugin<PortleHooks> =
  createPortlePlugin();

// resolveHostPlugins consumes the DEFAULT export (plugin object or factory).
export default portleSwitchboardPlugin;
