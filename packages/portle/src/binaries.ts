import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Where the two executables come from, in order:
 *   1. `PORTLE_FRPC_BIN` / `PORTLE_CADDY_BIN` (an explicit path wins, and only it is tried);
 *   2. `~/.ph/portle/bin/<name>` (where the release download will put them);
 *   3. the PATH.
 * The Caddy must be Portle's own build (rfc2136 + acme-dns modules); a stock
 * Caddy on the PATH starts but cannot obtain the certificate.
 */
export interface BinaryLocations {
  frpc: string | null;
  caddy: string | null;
  /** Every path that was looked at, for the status report. */
  searched: string[];
}

export interface ResolveBinariesOptions {
  env?: NodeJS.ProcessEnv;
  home?: string;
  platform?: NodeJS.Platform;
  exists?: (path: string) => boolean;
}

export const BINARY_ENV = {
  frpc: "PORTLE_FRPC_BIN",
  caddy: "PORTLE_CADDY_BIN",
} as const;

export function portleBinDir(
  home: string,
  platform: NodeJS.Platform = process.platform,
): string {
  return pathFor(platform).join(home, ".ph", "portle", "bin");
}

/** Paths are joined by the target platform's rules, so a lookup is the same whichever host runs it. */
function pathFor(platform: NodeJS.Platform): typeof path.posix {
  return platform === "win32" ? path.win32 : path.posix;
}

export function resolveBinaries(
  options: ResolveBinariesOptions = {},
): BinaryLocations {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const exists = options.exists ?? existsSync;
  const home = options.home ?? env.HOME ?? env.USERPROFILE ?? "";
  const suffix = platform === "win32" ? ".exe" : "";
  const p = pathFor(platform);
  const searched: string[] = [];

  const find = (name: "frpc" | "caddy"): string | null => {
    const explicit = env[BINARY_ENV[name]];
    if (explicit) {
      searched.push(explicit);
      return exists(explicit) ? explicit : null;
    }
    const candidates = [
      p.join(portleBinDir(home, platform), `${name}${suffix}`),
    ];
    for (const dir of (env.PATH ?? env.Path ?? "")
      .split(p.delimiter)
      .filter(Boolean)) {
      candidates.push(p.join(dir, `${name}${suffix}`));
    }
    for (const candidate of candidates) {
      searched.push(candidate);
      if (exists(candidate)) return candidate;
    }
    return null;
  };

  return { frpc: find("frpc"), caddy: find("caddy"), searched };
}
