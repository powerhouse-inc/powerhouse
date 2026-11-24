import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DevStackInfo } from "../api.js";

/** What the tool that started the server knows of the run. */
export type DevtoolsRun = {
  /** The tool that runs the server, for example the `ph` CLI. */
  tool: { name: string; version: string };
  /** When the run came up, as an ISO timestamp. */
  startedAt: string | null;
  /** Where the run's other services answer: a URL by service name. DevTools
   * shows `connect`, `switchboard` and `mcp`. */
  services: Readonly<Record<string, string>>;
};

export type DevtoolsStackOptions = {
  /** The folder of the project the server runs. */
  projectRoot: string;
  /** Read at each request: the services of a run come up after its server. */
  run?: () => DevtoolsRun;
  /** Where the app answers, when the server knows better than `run`. */
  appUrl?: () => string | undefined;
};

function readProject(projectRoot: string): DevStackInfo["project"] {
  try {
    const pkg = JSON.parse(
      readFileSync(join(projectRoot, "package.json"), "utf8"),
    ) as { name?: unknown; version?: unknown };
    return {
      name: typeof pkg.name === "string" ? pkg.name : null,
      version: typeof pkg.version === "string" ? pkg.version : null,
    };
  } catch {
    return { name: null, version: null };
  }
}

/** The project and where the parts of its stack answer, read now. */
export function readStack({
  projectRoot,
  run,
  appUrl,
}: DevtoolsStackOptions): DevStackInfo {
  const known = run?.();
  const service = (name: string) => known?.services[name] ?? null;
  return {
    project: readProject(projectRoot),
    ph: { version: known?.tool.version ?? "unknown" },
    app: { url: appUrl?.() ?? service("connect") },
    switchboard: { url: service("switchboard") },
    mcp: { url: service("mcp") },
    startedAt: known?.startedAt ?? null,
  };
}
