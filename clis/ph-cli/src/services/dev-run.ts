import type { ConnectDevRun } from "@powerhousedao/host-core";
import { getVersion } from "../get-version.js";
import { readVetraRuntime } from "../utils/vetra-runtime.js";

/** What this process knows of the run its dev server is part of. Another
 * process's `ph vetra` in the same project is not this run. */
export function readDevRun(projectDir: string): ConnectDevRun {
  const record = readVetraRuntime(projectDir);
  const own = record?.pid === process.pid ? record : undefined;
  const services: Record<string, string> = {};
  if (own?.connectUrl) services.connect = own.connectUrl;
  if (own?.switchboardUrl) services.switchboard = own.switchboardUrl;
  if (own?.mcpUrl) services.mcp = own.mcpUrl;
  return {
    tool: { name: "ph-cli", version: getVersion() },
    startedAt: own?.startedAt ?? null,
    services,
  };
}
