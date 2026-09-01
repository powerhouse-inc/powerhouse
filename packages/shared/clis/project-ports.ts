import fnv1a from "@sindresorhus/fnv1a";
import {
  AGENT_PORT_BAND_SIZE,
  AGENT_PORT_BAND_STUDIO,
  AGENT_PORT_BAND_SWITCHBOARD,
  AGENT_PORT_BAND_VETRA_CONNECT,
} from "./constants.js";

export type ProjectPorts = {
  switchboardPort: number;
  studioPort: number;
  vetraConnectPort: number;
};

/**
 * Derive a project's dev-server port triple from its package name.
 *
 * Name-derived rather than path-derived on purpose: the switchboard port is
 * written literally into the project's committed `.mcp.json`, because an MCP
 * client resolves that file at session start and cannot read the project
 * config or `.env`. A path-derived value would differ on every machine that
 * clones the repo.
 *
 * Three separate bands because `ph connect studio` and `ph vetra`'s Connect
 * are distinct servers that may run at the same time.
 */
export function deriveProjectPorts(projectName: string): ProjectPorts {
  if (!projectName.trim()) {
    throw new Error("A project name is required to derive project ports.");
  }
  const offset = Number(
    fnv1a(projectName, { size: 32 }) % BigInt(AGENT_PORT_BAND_SIZE),
  );
  return {
    switchboardPort: AGENT_PORT_BAND_SWITCHBOARD + offset,
    studioPort: AGENT_PORT_BAND_STUDIO + offset,
    vetraConnectPort: AGENT_PORT_BAND_VETRA_CONNECT + offset,
  };
}
