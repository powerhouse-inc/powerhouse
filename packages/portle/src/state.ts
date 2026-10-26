import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { EnrollmentResponse } from "./site/types.js";

/**
 * Everything the plugin keeps on disk lives under `<project>/.ph/portle/`:
 *
 *   enrollment.json   the site's identity and secrets (mode 600)
 *   site.json         the operator's choices: what the tunnel exposes, autostart
 *   frpc.toml, Caddyfile, certs/   rendered on every start (mode 600)
 *   caddy/            Caddy's data dir: the certificate, which must persist
 *   logs/             frpc.log, caddy.log
 */
export const PORTLE_DIR = join(".ph", "portle");
export const ENROLLMENT_FILE = "enrollment.json";
export const SITE_FILE = "site.json";

/** The operator's choices, kept beside the enrolment. */
export interface SiteSettings {
  /** The control plane the site enrolled with (needed for `ask` and acme-dns). */
  controlPlaneUrl: string;
  /** host:port every name proxies to unless `upstreams` names its label. */
  appUpstream: string;
  /** Per-label upstreams, e.g. `{ api: "127.0.0.1:7540", app: "127.0.0.1:2540" }`. */
  upstreams: Record<string, string>;
  /** rfc2136 straight to the relay's PowerDNS, or the acme-dns HTTPS fallback. */
  dns01Mode: "rfc2136" | "acmedns";
  /**
   * The local ports Caddy listens on. 443/80 is what the LAN path needs; a
   * machine that cannot bind them (another server, macOS without root)
   * can use high ports and still be reached through the relay.
   */
  listen: { https: number; http: number };
  /**
   * Send the upstream's own host:port as the Host header instead of the
   * public name. Dev servers that check the Host header (Vite's
   * `server.allowedHosts`) refuse the public name otherwise.
   */
  rewriteHostHeader?: boolean;
  /**
   * Publish Connect and the switchboard on ONE origin: the `app` label also
   * serves the switchboard's paths (proxied to the `api` upstream) and a
   * runtime config in which the switchboard's local origin is replaced by
   * the public one. Needs both the `app` and `api` labels. Default on.
   */
  sameOrigin?: boolean;
  /** Bring the tunnel up at boot when the gate passes. Set by start, cleared by stop. */
  autostart: boolean;
}

/**
 * The project root the switchboard serves: the directory of its config file
 * when the host passed one, else the working directory.
 */
export function projectRootOf(
  options: { configFile?: unknown } | undefined,
): string {
  const configFile = options?.configFile;
  return typeof configFile === "string" && configFile.length > 0
    ? dirname(resolve(configFile))
    : process.cwd();
}

export function stateDirOf(projectRoot: string): string {
  return join(projectRoot, PORTLE_DIR);
}

/** Writes atomically (temp file + rename) with the given mode (best effort on Windows). */
export function writeFileAtomic(
  path: string,
  content: string,
  mode = 0o644,
): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, content, { encoding: "utf8", mode });
  try {
    chmodSync(tmp, mode);
  } catch {
    /* Windows has no POSIX modes */
  }
  renameSync(tmp, path);
}

export function readEnrollment(stateDir: string): EnrollmentResponse | null {
  const path = join(stateDir, ENROLLMENT_FILE);
  if (!existsSync(path)) return null;
  const data = JSON.parse(
    readFileSync(path, "utf8"),
  ) as Partial<EnrollmentResponse>;
  if (!data.siteId || !data.siteSecret || !data.dns?.tsigSecret) {
    throw new Error(`${path} is not a valid enrolment`);
  }
  return data as EnrollmentResponse;
}

export function writeEnrollment(
  stateDir: string,
  enrollment: EnrollmentResponse,
): void {
  writeFileAtomic(
    join(stateDir, ENROLLMENT_FILE),
    `${JSON.stringify(enrollment, null, 2)}\n`,
    0o600,
  );
}

export const DEFAULT_SITE_SETTINGS: Omit<SiteSettings, "controlPlaneUrl"> = {
  appUpstream: "127.0.0.1:3000",
  upstreams: {},
  dns01Mode: "rfc2136",
  listen: { https: 443, http: 80 },
  rewriteHostHeader: false,
  sameOrigin: true,
  autostart: false,
};

export function readSiteSettings(stateDir: string): SiteSettings | null {
  const path = join(stateDir, SITE_FILE);
  if (!existsSync(path)) return null;
  const data = JSON.parse(readFileSync(path, "utf8")) as Partial<SiteSettings>;
  if (typeof data.controlPlaneUrl !== "string")
    throw new Error(`${path} names no control plane`);
  return {
    ...DEFAULT_SITE_SETTINGS,
    ...data,
    controlPlaneUrl: data.controlPlaneUrl,
  };
}

export function writeSiteSettings(
  stateDir: string,
  settings: SiteSettings,
): void {
  writeFileAtomic(
    join(stateDir, SITE_FILE),
    `${JSON.stringify(settings, null, 2)}\n`,
    0o600,
  );
}
