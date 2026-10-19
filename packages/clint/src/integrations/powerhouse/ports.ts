/**
 * Port derivation and resolution for per-CLI namespacing.
 *
 * When multiple ph-clint CLIs run simultaneously, they need different default
 * ports and service names. This module provides deterministic hash-based port
 * defaults and async port scanning.
 */

import { isPortFree } from "../../core/preflight.js";
import type {
  ReactorConfiguration,
  SwitchboardConfig,
  ConnectConfig,
} from "./types.js";

/**
 * DJB2 hash seeded with a salt → port in range 10000–59900.
 *
 * Deterministic: same (cliName, salt) always produces the same port.
 */
export function defaultPort(cliName: string, salt: string): number {
  const input = `${cliName}:${salt}`;
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  // Round to nearest 10 so ports are easy to remember
  const raw = 10000 + (hash % 49901);
  return Math.round(raw / 10) * 10;
}

/**
 * Scan [port, port+range-1] for the first free port.
 * Throws with a clear error if no port in the range is available.
 *
 * @param port   Base port to start scanning from.
 * @param range  Number of ports to scan (default 1).
 * @param label  Human-readable label for error messages.
 */
export async function resolvePort(
  port: number,
  range: number,
  label: string,
): Promise<number> {
  for (let p = port; p < port + range; p++) {
    if (await isPortFree(p)) return p;
  }
  if (range === 1) {
    throw new Error(
      `${label} port ${port} is already in use\n  Hint: Stop the process using port ${port}, or use a different port`,
    );
  }
  throw new Error(
    `${label}: no free port in range ${port}–${port + range - 1}\n  Hint: Free a port in this range, or configure a different port`,
  );
}

/**
 * Stamp port and name defaults onto switchboard/connect sub-configs.
 *
 * Called synchronously in configureReactor() — no port scanning here,
 * just default derivation. The actual port scan (resolvePort) happens
 * later in startSwitchboardLayer() / connect preflight.
 */
export function resolveReactorDefaults(
  cliName: string,
  config: Pick<ReactorConfiguration, "switchboard" | "connect">,
): { switchboard?: SwitchboardConfig; connect?: ConnectConfig } {
  const result: { switchboard?: SwitchboardConfig; connect?: ConnectConfig } =
    {};

  if (config.switchboard) {
    result.switchboard = {
      ...config.switchboard,
      port: config.switchboard.port ?? defaultPort(cliName, "switchboard"),
      name: config.switchboard.name ?? `${cliName}-api`,
    };
  }

  if (config.connect) {
    result.connect = {
      ...config.connect,
      port: config.connect.port ?? defaultPort(cliName, "connect"),
      name: config.connect.name ?? `${cliName}-studio`,
    };
  }

  return result;
}
