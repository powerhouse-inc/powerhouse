/**
 * Switchboard — wraps the caller-provided Reactor via
 * `@powerhousedao/switchboard/server`'s `startSwitchboard`, exposing GraphQL
 * (including the `Packages` subgraph for dynamic install/uninstall), MCP,
 * and attachment endpoints. The caller's reactor is forwarded through
 * switchboard's `reactor` dep.
 */

import type { SwitchboardConfigInput } from "@powerhousedao/switchboard/config";
import type { ReactorClientModule, SwitchboardInstance } from "./types.js";

export interface StartSwitchboardOptions {
  /** The ReactorClientModule from Phase 1. */
  reactorModule: ReactorClientModule;
  /** Hostname/IP to bind to. Default: 'localhost'. */
  host?: string;
  /** HTTP port for Switchboard. */
  port: number;
  /** Path for the Switchboard read model database. */
  dbPath: string;
  /** Default drive ID (for constructing the drive URL). */
  driveId: string;
  /**
   * Registry URL for `HttpPackageLoader`. When set, the switchboard's
   * `Packages` subgraph is registered (install/uninstall mutations) and
   * dynamic package resolution is enabled.
   */
  registryUrl?: string;
}

interface SwitchboardHandle {
  shutdown: () => Promise<void>;
}

/**
 * Build the SwitchboardInstance result from a raw handle.
 *
 * Pure function — constructs URLs and forwards the shutdown logic.
 * Separated from startSwitchboard for testability (no lazy imports).
 */
export function buildSwitchboardInstance(
  options: Pick<StartSwitchboardOptions, "host" | "port" | "driveId">,
  handle: SwitchboardHandle,
): SwitchboardInstance {
  const host = options.host ?? "localhost";
  const switchboardUrl = `http://${host}:${options.port}/graphql`;
  const driveUrl = `http://${host}:${options.port}/d/${options.driveId}`;
  const mcpUrl = `http://${host}:${options.port}/mcp`;

  return {
    switchboardUrl,
    driveUrl,
    mcpUrl,
    async shutdown() {
      try {
        await handle.shutdown();
      } catch {
        // Best-effort shutdown
      }
    },
  };
}

interface StartSwitchboardEntry {
  initSwitchboardProcess: (config: SwitchboardConfigInput) => void;
  startSwitchboard: (
    config: SwitchboardConfigInput,
    deps: { reactor: ReactorClientModule },
  ) => Promise<SwitchboardHandle & { port: number }>;
}

/**
 * Start Switchboard wrapping the caller-provided Reactor.
 *
 * Lazy-loads `@powerhousedao/switchboard/server` — it's an optional peer
 * dependency. Hands the pre-built ReactorClientModule to switchboard's
 * `startSwitchboard` so we don't construct a second Reactor.
 */
export async function startSwitchboard(
  options: StartSwitchboardOptions,
): Promise<SwitchboardInstance> {
  const [server, { switchboardConfigFromEnv }, { callerOverEnv }] =
    await Promise.all([
      import("@powerhousedao/switchboard/server") as unknown as Promise<StartSwitchboardEntry>,
      import("@powerhousedao/switchboard/config/env"),
      import("@powerhousedao/switchboard/config"),
    ]);

  // The process env still configures the switchboard, under these options.
  const config = callerOverEnv(switchboardConfigFromEnv(process.env), {
    server: {
      port: options.port,
      // Fail rather than silently shift ports when the requested port is busy.
      strictPort: true,
    },
    storage: { readModel: { url: options.dbPath } },
    features: { mcp: true },
    packages: { list: [], registryUrl: options.registryUrl },
  });
  server.initSwitchboardProcess(config);
  const handle = await server.startSwitchboard(config, {
    reactor: options.reactorModule,
  });

  return buildSwitchboardInstance(options, handle);
}
