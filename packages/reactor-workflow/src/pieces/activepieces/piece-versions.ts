// Which versions of a piece each remote source can serve.
import { npmRegistryBaseUrl } from "./fetch.js";
import { pieceRegistrySource } from "./registry-source.js";

export type VersionListing =
  | { kind: "listed"; versions: string[] }
  // The source answered and has no such piece.
  | { kind: "absent" }
  | { kind: "unreachable"; detail: string };

interface Cached {
  value: VersionListing;
  expiresAt: number;
}

// Short: a publish should show up without a restart, and an absent piece is
// asked for again soon, since a retried trigger may be waiting on its publish
const LISTED_TTL_MS = 5 * 60_000;
const ABSENT_TTL_MS = 30_000;
const DEFAULT_TIMEOUT_MS = 5_000;

const cache = new Map<string, Cached>();
const inFlight = new Map<string, Promise<VersionListing>>();

/** Test seam: forget every listing. */
export function clearVersionListings(): void {
  cache.clear();
}

async function listing(
  key: string,
  load: () => Promise<VersionListing>,
  fresh: boolean,
): Promise<VersionListing> {
  const cached = cache.get(key);
  if (!fresh && cached && cached.expiresAt > Date.now()) return cached.value;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const started = load()
    .then((value) => {
      // An unreachable source is no answer, so it is never remembered.
      if (value.kind !== "unreachable") {
        const ttl = value.kind === "listed" ? LISTED_TTL_MS : ABSENT_TTL_MS;
        cache.set(key, { value, expiresAt: Date.now() + ttl });
      }
      return value;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, started);
  return started;
}

async function getJson(
  url: string,
  timeoutMs: number,
  headers?: Record<string, string>,
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    ...(headers ? { headers } : {}),
  });
  const body: unknown = await response.json().catch(() => undefined);
  return { status: response.status, body };
}

function unreachable(url: string, error: unknown): VersionListing {
  const reason = error instanceof Error ? error.message : String(error);
  return { kind: "unreachable", detail: `${url}: ${reason}` };
}

export interface ListingOptions {
  timeoutMs?: number;
  fresh?: boolean;
}

// GET <registry>/pieces/<name>/versions, newest first. Undefined without a registry.
export function registryVersions(
  name: string,
  options: ListingOptions = {},
): Promise<VersionListing> | undefined {
  const source = pieceRegistrySource();
  if (!source) return undefined;
  const url = `${source.pieceUrl(name)}/versions`;
  return listing(
    `registry\u0000${url}`,
    async () => {
      try {
        const { status, body } = await getJson(
          url,
          options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        );
        if (status === 404) return { kind: "absent" };
        if (status < 200 || status >= 300 || !Array.isArray(body)) {
          return unreachable(url, new Error(`responded ${status}`));
        }
        const versions = (body as { version?: unknown }[])
          .map((entry) => entry.version)
          .filter((version): version is string => typeof version === "string");
        return { kind: "listed", versions };
      } catch (error) {
        return unreachable(url, error);
      }
    },
    options.fresh === true,
  );
}

// The versions an npm packument lists, read in its abbreviated form.
export function npmVersions(
  name: string,
  options: ListingOptions = {},
): Promise<VersionListing> {
  const url = `${npmRegistryBaseUrl()}/${name.replace("/", "%2f")}`;
  return listing(
    `npm\u0000${url}`,
    async () => {
      try {
        const { status, body } = await getJson(
          url,
          options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          { accept: "application/vnd.npm.install-v1+json" },
        );
        if (status === 404) return { kind: "absent" };
        const versions = (body as { versions?: unknown } | undefined)?.versions;
        if (status < 200 || status >= 300 || !versions) {
          return unreachable(url, new Error(`responded ${status}`));
        }
        return {
          kind: "listed",
          versions: Object.keys(versions as Record<string, unknown>),
        };
      } catch (error) {
        return unreachable(url, error);
      }
    },
    options.fresh === true,
  );
}
