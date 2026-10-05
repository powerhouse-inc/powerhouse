// What the Powerhouse routes read: processed package versions and pieces from
// Postgres, with short-lived caches that registry events clear.
import type { Manifest } from "@powerhousedao/shared";
import type { Database } from "./db/database.js";
import type { EventBus, RegistryEvent } from "./events.js";
import { enqueue, ensureJob, ON_DEMAND_PRIORITY, wakeWorkers } from "./jobs.js";
import { getDocumentTypesFromManifest } from "./packages.js";
import { fetchPackument } from "./processor.js";
import { compareSemver } from "./semver.js";
import type { PackageInfo } from "./types.js";

// A safety net for a missed NOTIFY; events clear the caches first
const CACHE_TTL_MS = 30_000;
const POLL_MS = 1_000;
export const ON_DEMAND_TIMEOUT_MS = 60_000;
const VERSION_CACHE_MAX = 5_000;

const FAILED_RETRY_AFTER = "15 minutes";

export interface VersionRow {
  package: string;
  version: string;
  status: "pending" | "ready" | "failed";
  manifest: Manifest | null;
  packageJsonVersion: string | null;
  files: string[];
  error: string | null;
  /** Failed long enough ago that a request may try it again */
  retryable?: boolean;
}

export interface PackageRow {
  name: string;
  local: boolean;
  distTags: Record<string, string>;
  versions: string[];
  latest: string | null;
}

export interface PieceRow {
  name: string;
  version: string;
  package: string;
  displayName: string;
  description: string | null;
  descriptor: Record<string, unknown> | null;
  descriptorPath: string;
  bundleFile: string;
  bundleKey: string | null;
  publishedAt: string | null;
}

export type EnsureResult =
  | { kind: "ready"; row: VersionRow }
  | { kind: "missing" }
  | { kind: "failed"; error: string }
  | { kind: "timeout" };

function pieceColumns(table: string): string {
  return `${table}.name, ${table}.version, ${table}.package,
    ${table}.display_name AS "displayName", ${table}.description,
    ${table}.descriptor, ${table}.descriptor_path AS "descriptorPath",
    ${table}.bundle_file AS "bundleFile", ${table}.bundle_key AS "bundleKey",
    ${table}.published_at AS "publishedAt"`;
}

interface Cached<T> {
  value: T;
  at: number;
}

export interface PackageQuery {
  search: string;
  names: string[];
  categories: string[];
  publishers: string[];
  moduleTypes: string[];
  documentType: string;
  limit: number;
  offset: number;
}

export interface PieceQuery {
  search: string;
  limit: number;
  offset: number;
}

// Local packages with a listed version; recomputeLatest keeps listed_*
const LISTED = `
  SELECT p.name, p.dist_tags, p.versions, p.listed_manifest AS manifest,
         p.listed_package_json_version AS package_json_version,
         p.search_doc, p.search_tsv
    FROM registry_packages p
   WHERE p.local AND p.listed_manifest IS NOT NULL
     AND (cardinality($1::text[]) = 0 OR lower(p.name) = ANY($1)
          OR lower(p.listed_manifest->>'name') = ANY($1))`;

// What callers read; the search columns only filter and rank
const LISTED_COLUMNS =
  "name, dist_tags, versions, manifest, package_json_version";

// Full-text match, fuzzy word match, or substring; `q` and `like` are placeholders
function searchMatch(t: string, q: string, like: string): string {
  return `(${q} = '' OR ${t}search_tsv @@ websearch_to_tsquery('english', ${q})
    OR ${q} <% ${t}search_doc OR ${t}search_doc LIKE ${like})`;
}

function searchScore(t: string, q: string): string {
  return `CASE WHEN ${q} = '' THEN 0 ELSE greatest(
    ts_rank(${t}search_tsv, websearch_to_tsquery('english', ${q})),
    word_similarity(${q}, ${t}search_doc)) END`;
}

interface ListedRow {
  name: string;
  dist_tags: Record<string, string>;
  versions: string[];
  manifest: Manifest;
  package_json_version: string | null;
}

function likePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

function toListedInfo(row: ListedRow): PackageInfo {
  return toPackageInfo(row.name, row.manifest, row.package_json_version, {
    distTags: row.dist_tags,
    versions: row.versions,
  });
}

export class Catalog {
  #db: Database;
  #events: EventBus;
  #registryUrl: () => string;
  #versions = new Map<string, Cached<VersionRow | null>>();
  // Claims are permanent, so a known owner never goes stale
  #pieceOwners = new Map<string, string>();
  #pieceRows = new Map<string, PieceRow>();
  #changeListeners = new Set<() => void>();
  #ownersFor:
    | ((names: string[]) => Promise<Record<string, string[]>>)
    | undefined;

  constructor(db: Database, events: EventBus, registryUrl: () => string) {
    this.#db = db;
    this.#events = events;
    this.#registryUrl = registryUrl;
    events.on((event) => this.#invalidate(event));
  }

  /** Forgets every cached version, e.g. after notifications may have been lost. */
  reset(): void {
    this.#versions.clear();
    this.#pieceRows.clear();
    for (const fn of this.#changeListeners) fn();
  }

  /** Called whenever what the listings show may have changed. */
  onChange(fn: () => void): void {
    this.#changeListeners.add(fn);
  }

  #invalidate(event: RegistryEvent): void {
    for (const fn of this.#changeListeners) fn();
    const removed =
      event.type === "versions-removed"
        ? event.versions && new Set(event.versions)
        : new Set([event.version]);
    for (const [key, row] of this.#pieceRows) {
      if (
        row.package === event.packageName &&
        (!removed || removed.has(row.version))
      ) {
        this.#pieceRows.delete(key);
      }
    }
    if (event.type === "versions-removed" && event.versions === null) {
      for (const key of this.#versions.keys()) {
        if (key.startsWith(`${event.packageName}@`)) this.#versions.delete(key);
      }
      return;
    }
    const versions =
      event.type === "versions-removed"
        ? (event.versions ?? [])
        : [event.version];
    for (const version of versions) {
      this.#versions.delete(`${event.packageName}@${version}`);
    }
  }

  #fresh<T>(cached: Cached<T> | undefined): cached is Cached<T> {
    return !!cached && Date.now() - cached.at < CACHE_TTL_MS;
  }

  /** Local packages at their listed version, in name order. */
  async packages(): Promise<PackageInfo[]> {
    const rows = await this.#db.query<ListedRow>(
      `SELECT ${LISTED_COLUMNS} FROM (${LISTED}) listed ORDER BY name`,
      [[]],
    );
    return rows.rows.map(toListedInfo);
  }

  /**
   * One page of listed packages. Values within a filter OR, filters AND. Name
   * substrings rank first, then other substrings, then full-text/fuzzy score.
   */
  async searchPackages(
    q: PackageQuery,
    opts: { owners?: boolean } = {},
  ): Promise<{ items: PackageInfo[]; total: number }> {
    const search = q.search.trim().toLowerCase();
    const rows = await this.#db.query<ListedRow & { total: string }>(
      `SELECT ${LISTED_COLUMNS}, count(*) OVER () AS total FROM (${LISTED}) listed
        WHERE (cardinality($4::text[]) = 0 OR manifest->>'category' = ANY($4))
          AND (cardinality($5::text[]) = 0
               OR manifest#>>'{publisher,name}' = ANY($5))
          AND (cardinality($6::text[]) = 0 OR EXISTS (
                SELECT 1 FROM unnest($6::text[]) t
                 WHERE jsonb_typeof(manifest->t) = 'array'
                   AND jsonb_array_length(manifest->t) > 0))
          AND ($7 = '' OR manifest->'documentModels'
               @> jsonb_build_array(jsonb_build_object('id', $7::text)))
          AND ${searchMatch("", "$2", "$3")}
        ORDER BY ($2 <> '' AND (lower(name) LIKE $3
                  OR lower(manifest->>'name') LIKE $3)) DESC,
                 ($2 <> '' AND search_doc LIKE $3) DESC,
                 ${searchScore("", "$2")} DESC, name
        LIMIT $8 OFFSET $9`,
      [
        q.names.map((n) => n.toLowerCase()),
        search,
        likePattern(search),
        q.categories,
        q.publishers,
        q.moduleTypes,
        q.documentType,
        q.limit,
        q.offset,
      ],
    );
    let items = rows.rows.map(toListedInfo);
    if (opts.owners && this.#ownersFor && items.length) {
      const names = rows.rows.map((r) => r.name);
      const owners = await this.#ownersFor(names).catch((err: unknown) => {
        console.error("[registry] owner lookup failed:", err);
        return {} as Record<string, string[]>;
      });
      items = items.map((info, i) =>
        names[i] in owners ? { ...info, owners: owners[names[i]] } : info,
      );
    }
    // Past the last page there is no row to carry the count
    const total = rows.rows.length
      ? Number(rows.rows[0].total)
      : q.offset > 0
        ? await this.#countPackages({ ...q, offset: 0, limit: 1 })
        : 0;
    return { items, total };
  }

  async #countPackages(q: PackageQuery): Promise<number> {
    return (await this.searchPackages(q)).total;
  }

  /** Categories and publishers across the listed packages `names` allows. */
  async packageFacets(
    names: string[],
  ): Promise<{ categories: string[]; publishers: string[] }> {
    const rows = await this.#db.query<{
      categories: string[] | null;
      publishers: string[] | null;
    }>(
      `SELECT array_agg(DISTINCT manifest->>'category' ORDER BY manifest->>'category')
                FILTER (WHERE manifest->>'category' <> '') AS categories,
              array_agg(DISTINCT manifest#>>'{publisher,name}'
                        ORDER BY manifest#>>'{publisher,name}')
                FILTER (WHERE manifest#>>'{publisher,name}' <> '') AS publishers
         FROM (${LISTED}) listed`,
      [names.map((n) => n.toLowerCase())],
    );
    return {
      categories: rows.rows[0]?.categories ?? [],
      publishers: rows.rows[0]?.publishers ?? [],
    };
  }

  /** Names of listed packages that define a document model. */
  async packagesWithDocumentType(documentType: string): Promise<string[]> {
    const rows = await this.#db.query<ListedRow>(
      `SELECT ${LISTED_COLUMNS} FROM (${LISTED}) listed
        WHERE manifest->'documentModels'
              @> jsonb_build_array(jsonb_build_object('id', $2::text))
        ORDER BY name`,
      [[], documentType],
    );
    return rows.rows.map((row) => toListedInfo(row).name);
  }

  /** Attaches package owners to full package pages. */
  setOwnerLookup(
    lookup: (names: string[]) => Promise<Record<string, string[]>>,
  ): void {
    this.#ownersFor = lookup;
  }

  async packageRow(name: string): Promise<PackageRow | null> {
    const rows = await this.#db.query<PackageRow>(
      `SELECT name, local, dist_tags AS "distTags", versions, latest
         FROM registry_packages WHERE name = $1`,
      [name],
    );
    return rows.rows[0] ?? null;
  }

  async version(pkg: string, version: string): Promise<VersionRow | null> {
    const key = `${pkg}@${version}`;
    const cached = this.#versions.get(key);
    if (this.#fresh(cached) && cached.value?.status === "ready") {
      return cached.value;
    }
    const rows = await this.#db.query<VersionRow>(
      `SELECT package, version, status, manifest,
              package_json_version AS "packageJsonVersion", files, error,
              (status = 'failed' AND NOT permanent
               AND updated_at < now() - $3::interval) AS retryable
         FROM registry_versions WHERE package = $1 AND version = $2`,
      [pkg, version, FAILED_RETRY_AFTER],
    );
    const row = rows.rows[0] ?? null;
    // Only ready rows are served from the cache, so only they are kept
    if (row?.status === "ready") {
      this.#versions.delete(key);
      this.#versions.set(key, { value: row, at: Date.now() });
      if (this.#versions.size > VERSION_CACHE_MAX) {
        this.#versions.delete(this.#versions.keys().next().value!);
      }
    }
    return row;
  }

  // The concrete version a tag names (a version, a dist-tag, or `latest`);
  // null for a genuine not-found, and throws when upstream fails
  async resolveVersion(pkg: string, tag?: string): Promise<string | null> {
    const row = await this.packageRow(pkg);
    const fromRow = row?.local
      ? pickVersion(row.distTags, row.versions, tag)
      : null;
    if (fromRow) return fromRow;
    const packument = await fetchPackument(this.#registryUrl(), pkg);
    if (!packument) return null;
    return pickVersion(
      packument["dist-tags"] ?? {},
      Object.keys(packument.versions ?? {}),
      tag,
    );
  }

  /** A processed version, queuing it and waiting when no worker has yet. */
  async ensureVersion(
    pkg: string,
    version: string,
    timeoutMs = ON_DEMAND_TIMEOUT_MS,
  ): Promise<EnsureResult> {
    let row = await this.version(pkg, version);
    if (row?.status === "ready") return { kind: "ready", row };
    if (row?.status === "failed" && !row.retryable) {
      return { kind: "failed", error: row.error ?? "" };
    }
    if (row?.status === "failed") {
      // A failure left this long may have been transient, such as throttling
      const local = (await this.packageRow(pkg))?.local === true;
      await this.#db.transaction(async (tx) => {
        // Another request may have reset it already; its job is enough
        const reset = await tx.query(
          `UPDATE registry_versions SET status = 'pending', error = NULL, updated_at = now()
            WHERE package = $1 AND version = $2 AND status = 'failed'
            RETURNING version`,
          [pkg, version],
        );
        if (reset.rows.length === 0) return;
        await enqueue(
          tx,
          "process",
          pkg,
          version,
          {},
          local ? 0 : ON_DEMAND_PRIORITY,
        );
      });
      await wakeWorkers(this.#db);
    } else if (!row) {
      const packument = await fetchPackument(this.#registryUrl(), pkg);
      if (!packument?.versions?.[version]) return { kind: "missing" };
      // Mirroring an npm package on request waits behind publishes
      const local = (await this.packageRow(pkg))?.local === true;
      await this.#db.transaction(async (tx) => {
        await tx.query(
          `INSERT INTO registry_versions (package, version, status)
           VALUES ($1, $2, 'pending') ON CONFLICT (package, version) DO NOTHING`,
          [pkg, version],
        );
        await enqueue(
          tx,
          "process",
          pkg,
          version,
          {},
          local ? 0 : ON_DEMAND_PRIORITY,
        );
      });
      await wakeWorkers(this.#db);
    } else if (await ensureJob(this.#db, "process", pkg, version)) {
      // Pending with no job: its job was lost, so queue it again
      await wakeWorkers(this.#db);
    }

    const deadline = Date.now() + timeoutMs;
    let wake: (() => void) | undefined;
    const off = this.#events.on((event) => {
      if (event.packageName === pkg) wake?.();
    });
    try {
      while (Date.now() < deadline) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, POLL_MS);
          wake = () => {
            clearTimeout(timer);
            resolve();
          };
        });
        this.#versions.delete(`${pkg}@${version}`);
        row = await this.version(pkg, version);
        if (!row) return { kind: "missing" };
        if (row.status === "ready") return { kind: "ready", row };
        if (row.status === "failed") {
          return { kind: "failed", error: row.error ?? "" };
        }
      }
      return { kind: "timeout" };
    } finally {
      off();
    }
  }

  /** The latest version of every piece local packages ship. */
  async pieceCatalog(): Promise<PieceRow[]> {
    return (await this.searchPieces({ search: "", limit: 10_000, offset: 0 }))
      .rows;
  }

  /** One page of latest pieces, ranked like {@link searchPackages}. */
  async searchPieces(
    q: PieceQuery,
  ): Promise<{ rows: PieceRow[]; total: number }> {
    const search = q.search.trim().toLowerCase();
    const rows = await this.#db.query<PieceRow & { total: string }>(
      `SELECT ${pieceColumns("r")}, count(*) OVER () AS total
         FROM registry_pieces r
         JOIN registry_packages p ON p.name = r.package
        WHERE r.is_latest AND p.local AND r.descriptor IS NOT NULL
          AND ${searchMatch("r.", "$1", "$2")}
        ORDER BY ($1 <> '' AND lower(coalesce(r.descriptor->>'displayName',
                   r.display_name) || ' ' || r.name) LIKE $2) DESC,
                 ($1 <> '' AND r.search_doc LIKE $2) DESC,
                 ${searchScore("r.", "$1")} DESC,
                 coalesce(nullif(r.descriptor->>'displayName', ''),
                          r.display_name)
        LIMIT $3 OFFSET $4`,
      [search, likePattern(search), q.limit, q.offset],
    );
    const total = rows.rows.length
      ? Number(rows.rows[0].total)
      : q.offset > 0
        ? (await this.searchPieces({ ...q, offset: 0, limit: 1 })).total
        : 0;
    return { rows: rows.rows.map(({ total: _, ...row }) => row), total };
  }

  async pieceLatest(name: string): Promise<PieceRow | null> {
    const rows = await this.#db.query<PieceRow>(
      `SELECT ${pieceColumns("r")}
         FROM registry_pieces r
         JOIN registry_packages p ON p.name = r.package
        WHERE r.name = $1 AND r.is_latest AND p.local`,
      [name],
    );
    return rows.rows[0] ?? null;
  }

  /** Every processed version of a piece, newest first. */
  async pieceVersions(name: string): Promise<PieceRow[]> {
    const rows = await this.#db.query<PieceRow>(
      `SELECT ${pieceColumns("r")} FROM registry_pieces r WHERE r.name = $1`,
      [name],
    );
    return rows.rows.sort((a, b) => compareSemver(b.version, a.version));
  }

  async pieceVersion(name: string, version: string): Promise<PieceRow | null> {
    const key = `${name}@${version}`;
    const cached = this.#pieceRows.get(key);
    if (cached) return cached;
    const rows = await this.#db.query<PieceRow>(
      `SELECT ${pieceColumns("r")} FROM registry_pieces r
        WHERE r.name = $1 AND r.version = $2`,
      [name, version],
    );
    const row = rows.rows[0] ?? null;
    if (row) remember(this.#pieceRows, key, row);
    return row;
  }

  /** The package a piece name belongs to, if any. */
  async pieceOwner(name: string): Promise<string | null> {
    const cached = this.#pieceOwners.get(name);
    if (cached) return cached;
    const rows = await this.#db.query<{ package: string }>(
      "SELECT package FROM registry_piece_owners WHERE name = $1",
      [name],
    );
    const owner = rows.rows[0]?.package ?? null;
    if (owner) remember(this.#pieceOwners, name, owner);
    return owner;
  }
}

const LOOKUP_CACHE_MAX = 10_000;

function remember<V>(map: Map<string, V>, key: string, value: V): void {
  map.set(key, value);
  if (map.size > LOOKUP_CACHE_MAX) map.delete(map.keys().next().value!);
}

function pickVersion(
  distTags: Record<string, string>,
  versions: string[],
  tag?: string,
): string | null {
  if (tag) {
    if (versions.includes(tag)) return tag;
    return distTags[tag] ?? null;
  }
  return distTags.latest ?? Object.values(distTags)[0] ?? null;
}

export function toPackageInfo(
  name: string,
  manifest: Manifest | null,
  packageJsonVersion: string | null,
  meta: { distTags?: Record<string, string>; versions?: string[] } = {},
): PackageInfo {
  const resolvedName = manifest?.name || name;
  const distTags =
    meta.distTags && Object.keys(meta.distTags).length > 0
      ? meta.distTags
      : undefined;
  const versions =
    meta.versions && meta.versions.length > 0 ? meta.versions : undefined;
  return {
    name: resolvedName,
    path: `/-/cdn/${name}`,
    manifest,
    documentTypes: getDocumentTypesFromManifest(manifest),
    version: packageJsonVersion ?? undefined,
    distTags,
    versions,
  };
}
