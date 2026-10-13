/**
 * Switchboard — wraps the caller-provided Reactor via
 * `@powerhousedao/switchboard/server`'s `startSwitchboard`, exposing GraphQL
 * (including the `Packages` subgraph for dynamic install/uninstall), MCP,
 * and attachment endpoints. The caller's reactor is forwarded through the
 * `reactor` option on switchboard's `StartServerOptions`.
 */

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
  startSwitchboard: (opts: {
    reactor: ReactorClientModule;
    port: number;
    dbPath: string;
    mcp?: boolean;
    packages?: string[];
    registryUrl?: string;
    strictPort?: boolean;
  }) => Promise<SwitchboardHandle & { port: number }>;
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
  const { startSwitchboard: startSwitchboardImpl } =
    (await import("@powerhousedao/switchboard/server")) as unknown as StartSwitchboardEntry;

  const handle = await startSwitchboardImpl({
    reactor: options.reactorModule,
    port: options.port,
    dbPath: options.dbPath,
    mcp: true,
    packages: [],
    registryUrl: options.registryUrl,
    // Fail rather than silently shift ports when the requested port is busy.
    strictPort: true,
  });

  return buildSwitchboardInstance(options, handle);
}
