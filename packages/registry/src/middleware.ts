import express, {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import crypto from "node:crypto";
import path from "node:path";
import type { Readable } from "node:stream";
import type { ArtifactStore } from "./artifacts.js";
import type { AuthStore } from "./auth/auth-store.js";
import type { Catalog, EnsureResult, VersionRow } from "./catalog.js";
import { toPackageInfo } from "./catalog.js";
import { isExactVersion, parsePackageSpec } from "./cdn.js";
import type { Database } from "./db/database.js";
import { enqueue, wakeWorkers } from "./jobs.js";
import type { SSEChannel } from "./notifications/sse.js";
import type { PublisherIdentity } from "./notifications/types.js";
import type { WebhookStore } from "./notifications/webhook.js";
import { toPackageListItem } from "./packages.js";
import { PACKAGE_MODULE_TYPES } from "@powerhousedao/shared/registry";
import {
  pieceCatalog,
  pieceDetail,
  pieceNamesInTarball,
  RESERVED_PIECE_SCOPE,
  versionSummary,
} from "./pieces.js";
import { bundleKey, contentTypeOf, filesKey } from "./processor.js";
import type { PackageInfo, RegistryConfig } from "./types.js";

// Paginated /packages and /pieces: default and max page sizes
const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 50;
// How long a client is told to wait while a worker processes a version
const RETRY_AFTER_SECONDS = "5";

// Wildcard routes; the matched rest of the path is req.params[0]
const PACKAGE_ROUTE = /^\/packages\/(.+)$/;
const PIECE_ROUTE = /^\/pieces\/(.+)$/;
// `<piece name>/<version>.tgz`; a scoped name keeps its slash
const BUNDLE_ROUTE = /^\/-\/pieces\/bundled\/(.+)\/([^/]+)\.tgz$/;
const CDN_ROUTE = /^\/-\/cdn\/(.+)$/;

export interface RegistryServices {
  db: Database;
  catalog: Catalog;
  artifacts: ArtifactStore;
  webhooks: WebhookStore;
  sse: SSEChannel;
  ownerStore?: AuthStore;
}

/** Parse+clamp a `limit` query param to 1..MAX_PAGE_SIZE (default 30). */
function clampPageSize(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(n), MAX_PAGE_SIZE);
}

/** Parse an `offset` query param to a non-negative integer (default 0). */
function parseOffset(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

// Repeated keys (`?name=a&name=b`) as a list of strings
function queryList(raw: unknown): string[] {
  const values = Array.isArray(raw) ? raw : [raw];
  return values.filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
}

function queryString(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

function pageParams(req: Request): { limit: number; offset: number } {
  return {
    limit: clampPageSize(req.query.limit),
    offset: parseOffset(req.query.offset),
  };
}

const IMMUTABLE = "public, max-age=31536000, immutable";
const PAGE_CACHE_MAX = 500;
const PAGE_CACHE_TTL_MS = 30_000;

// The file path is hashed: it comes from the URL and may hold characters
// invalid in a header value
function cdnEtag(version: string, filePath: string): string {
  const hash = crypto
    .createHash("sha1")
    .update(filePath)
    .digest("hex")
    .slice(0, 16);
  return `W/"${version}-${hash}"`;
}

function wildcard(req: Request): string {
  return (req.params as Record<string, string>)[0];
}

// `<name>/versions` when `<name>` is a whole piece name (`x` or `@scope/x`).
function versionsRouteName(raw: string): string | null {
  if (!raw.endsWith("/versions")) return null;
  const name = raw.slice(0, -"/versions".length);
  const slashes = name.split("/").length - 1;
  const valid = name.startsWith("@") ? slashes === 1 : slashes === 0;
  return valid && name !== "" ? name : null;
}

// Where a client reached us, for the absolute URLs the piece endpoints hand
// out. `trust proxy` is off here, so the forwarded scheme is read directly.
function originOf(req: Request): string {
  const forwarded = req.get("x-forwarded-proto")?.split(",")[0].trim();
  return `${forwarded || req.protocol}://${req.get("host") ?? ""}`;
}

// Publisher identity from verdaccio's remote_user (the renown middleware sets
// its name to the owner pkh DID). undefined when anonymous.
function publisherFromRequest(req: Request): PublisherIdentity | undefined {
  const name = (req as { remote_user?: { name?: string } }).remote_user?.name;
  if (!name) return undefined;
  if (name.startsWith("did:pkh:")) {
    const address = (name.split(":").pop() ?? name).toLowerCase();
    return { address, did: name };
  }
  return { address: name };
}

/** Strip the weak-validator prefix: weak comparison is correct for GET/HEAD. */
function opaqueTag(tag: string): string {
  return tag.startsWith("W/") ? tag.slice(2) : tag;
}

/** RFC 9110 If-None-Match: a comma-separated list of entity-tags or "*". */
function etagMatches(
  header: string | string[] | undefined,
  etag: string,
): boolean {
  if (!header) return false;
  const target = opaqueTag(etag);
  const value = Array.isArray(header) ? header.join(",") : header;
  return value.split(",").some((candidate) => {
    const tag = candidate.trim();
    return tag === "*" || opaqueTag(tag) === target;
  });
}

type VersionResolution =
  | { kind: "ok"; version: string }
  | { kind: "not-found" }
  | { kind: "upstream-error" };

// Exact versions skip the lookup; when upstream fails, the listed version of
// a known package stands in
async function resolvePackageVersion(
  catalog: Catalog,
  name: string,
  tag: string | undefined,
): Promise<VersionResolution> {
  if (tag && isExactVersion(tag)) return { kind: "ok", version: tag };
  try {
    const version = await catalog.resolveVersion(name, tag);
    return version ? { kind: "ok", version } : { kind: "not-found" };
  } catch {
    const row = await catalog.packageRow(name).catch(() => null);
    return row?.latest && !tag
      ? { kind: "ok", version: row.latest }
      : { kind: "upstream-error" };
  }
}

async function ensure(
  catalog: Catalog,
  name: string,
  version: string,
): Promise<EnsureResult | { kind: "upstream-error" }> {
  try {
    return await catalog.ensureVersion(name, version);
  } catch {
    return { kind: "upstream-error" };
  }
}

function sendNotReady(res: Response, result: { kind: string }): boolean {
  if (result.kind === "timeout") {
    res.setHeader("Retry-After", RETRY_AFTER_SECONDS);
    res.status(503).send("Package version is still being processed");
    return true;
  }
  if (result.kind === "upstream-error") {
    res.status(503).send("Upstream registry unavailable");
    return true;
  }
  return false;
}

// npm tarballs keep files under dist/, bun bundles under cdn/
// Cached rows are reused across requests; so are their file sets
const fileSets = new WeakMap<VersionRow, Set<string>>();

function resolveFile(row: VersionRow, filePath: string): string | null {
  const normalized = path.posix.normalize(filePath);
  if (normalized.startsWith("..") || path.posix.isAbsolute(normalized)) {
    return null;
  }
  let files = fileSets.get(row);
  if (!files) {
    files = new Set(row.files);
    fileSets.set(row, files);
  }
  for (const candidate of [
    normalized,
    `cdn/${normalized}`,
    `dist/cdn/${normalized}`,
    `dist/${normalized}`,
  ]) {
    if (files.has(candidate)) return candidate;
  }
  return null;
}

async function stream(
  res: Response,
  artifacts: ArtifactStore,
  key: string,
): Promise<boolean> {
  const artifact = await artifacts.get(key);
  if (!artifact) return false;
  if (artifact.size !== undefined) {
    res.setHeader("Content-Length", String(artifact.size));
  }
  if (artifact.body) {
    res.end(artifact.body);
    return true;
  }
  // pipe over stream/promises: its pipeline builds an AbortSignal per call
  const source = artifact.stream as Readable;
  await new Promise<void>((resolve) => {
    source.once("error", () => {
      // Headers may be out already; drop the socket so the client doesn't hang
      res.destroy();
      resolve();
    });
    res.once("close", () => {
      source.destroy();
      resolve();
    });
    source.pipe(res);
  });
  return true;
}

export function createPowerhouseRouter(
  config: RegistryConfig,
  services: RegistryServices,
): Router {
  const { catalog, artifacts, webhooks, sse, ownerStore } = services;
  const router = Router();

  // Owners are keyed by npm name; `pkg.name` may be the manifest's
  const withOwners = async (
    pkg: PackageInfo,
    npmName: string,
  ): Promise<PackageInfo> => {
    if (!ownerStore) return pkg;
    try {
      await ownerStore.init();
      const map = await ownerStore.getOwnersFor([npmName]);
      return npmName in map ? { ...pkg, owners: map[npmName] } : pkg;
    } catch (err) {
      console.error("[registry] owner lookup failed:", err);
      return pkg;
    }
  };

  const route =
    (handler: (req: Request, res: Response) => Promise<void>) =>
    (req: Request, res: Response, next: NextFunction) => {
      handler(req, res).catch(next);
    };

  // CORS on every response
  router.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    next();
  });

  // SSE endpoint for publish notifications
  router.get("/-/events", (_req: Request, res: Response) => {
    sse.addClient(res);
  });

  // Webhook management
  router.get(
    "/-/webhooks",
    route(async (_req, res) => {
      res.json(await webhooks.getWebhooks());
    }),
  );

  router.post(
    "/-/webhooks",
    express.json(),
    route(async (req, res) => {
      const { endpoint, headers } = req.body as {
        endpoint?: string;
        headers?: Record<string, string>;
      };
      if (!endpoint) {
        res.status(400).json({ error: "Missing required field: endpoint" });
        return;
      }
      await webhooks.addWebhook({ endpoint, headers });
      res.status(201).json({ endpoint, headers });
    }),
  );

  router.delete(
    "/-/webhooks",
    express.json(),
    route(async (req, res) => {
      const { endpoint } = req.body as { endpoint?: string };
      if (!endpoint) {
        res.status(400).json({ error: "Missing required field: endpoint" });
        return;
      }
      if (!(await webhooks.removeWebhook(endpoint))) {
        res.status(404).json({ error: "Webhook not found" });
        return;
      }
      res.status(204).end();
    }),
  );

  // Pages by URL until anything they list changes; the TTL covers a missed event
  const pages = new Map<string, { body: string; etag: string; at: number }>();
  catalog.onChange(() => pages.clear());

  const writePage = (
    req: Request,
    res: Response,
    page: { body: string; etag: string },
  ) => {
    res.setHeader("ETag", page.etag);
    if (etagMatches(req.headers["if-none-match"], page.etag)) {
      res.status(304).end();
      return;
    }
    res.type("application/json").send(page.body);
  };

  // True when a cached page answered the request
  const sendCachedPage = (req: Request, res: Response): boolean => {
    const cached = pages.get(req.originalUrl);
    if (!cached || Date.now() - cached.at > PAGE_CACHE_TTL_MS) return false;
    writePage(req, res, cached);
    return true;
  };

  // Pages are small: hashing each lets NGINX and clients revalidate with 304
  const sendPage = (req: Request, res: Response, page: object) => {
    const body = JSON.stringify(page);
    const etag = `"${crypto.createHash("sha1").update(body).digest("base64url")}"`;
    pages.delete(req.originalUrl);
    pages.set(req.originalUrl, { body, etag, at: Date.now() });
    if (pages.size > PAGE_CACHE_MAX) pages.delete(pages.keys().next().value!);
    writePage(req, res, { body, etag });
  };

  // One page of packages; the README lists the parameters
  router.get(
    "/packages",
    route(async (req, res) => {
      if (sendCachedPage(req, res)) return;
      const { limit, offset } = pageParams(req);
      const names = queryList(req.query.name);
      const [result, facets] = await Promise.all([
        catalog.searchPackages(
          {
            search: queryString(req.query.search),
            names,
            categories: queryList(req.query.category),
            publishers: queryList(req.query.publisher),
            moduleTypes: queryList(req.query.moduleType).filter((t) =>
              (PACKAGE_MODULE_TYPES as readonly string[]).includes(t),
            ),
            documentType: queryString(req.query.documentType),
            limit,
            offset,
          },
          { owners: req.query.detail === "full" },
        ),
        req.query.facets === "true" ? catalog.packageFacets(names) : undefined,
      ]);
      sendPage(req, res, {
        items:
          req.query.detail === "full"
            ? result.items
            : result.items.map(toPackageListItem),
        total: result.total,
        limit,
        offset,
        hasMore: offset + limit < result.total,
        ...(facets ? { facets } : {}),
      });
    }),
  );

  // Names of the packages that define a document model
  router.get(
    "/packages/by-document-type",
    route(async (req, res) => {
      const documentType = req.query.type;
      if (typeof documentType !== "string" || !documentType) {
        res
          .status(400)
          .json({ error: "Missing required query parameter: type" });
        return;
      }
      res.json(await catalog.packagesWithDocumentType(documentType));
    }),
  );

  // Single package info
  router.get(
    PACKAGE_ROUTE,
    route(async (req, res) => {
      const { name, tag } = parsePackageSpec(wildcard(req));
      const resolution = await resolvePackageVersion(catalog, name, tag);
      if (resolution.kind === "upstream-error") {
        res.status(503).send("Upstream registry unavailable");
        return;
      }
      if (resolution.kind === "not-found") {
        res.status(404).send("Package not found");
        return;
      }
      const result = await ensure(catalog, name, resolution.version);
      if (sendNotReady(res, result)) return;
      if (result.kind !== "ready" || !result.row.manifest) {
        res.status(404).send("Package not found");
        return;
      }
      const row = await catalog.packageRow(name);
      const pkg = toPackageInfo(
        name,
        result.row.manifest,
        result.row.packageJsonVersion,
        { distTags: row?.distTags, versions: row?.versions },
      );
      res.json(await withOwners(pkg, name));
    }),
  );

  // A page of the piece catalog, its items shaped like cloud.activepieces.com's
  router.get(
    "/pieces",
    route(async (req, res) => {
      if (sendCachedPage(req, res)) return;
      const { limit, offset } = pageParams(req);
      const { rows, total } = await catalog.searchPieces({
        search: queryString(req.query.search),
        limit,
        offset,
      });
      sendPage(req, res, {
        items: pieceCatalog(
          rows,
          req.query.suggestionType === "ACTION_AND_TRIGGER",
        ),
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      });
    }),
  );

  // A version of a piece, processing its package version when no worker has
  const pieceAt = async (name: string, version: string) => {
    const found = await catalog.pieceVersion(name, version);
    if (found) return found;
    const owner = await catalog.pieceOwner(name);
    if (!owner) return null;
    const result = await ensure(catalog, owner, version);
    return result.kind === "ready" ? catalog.pieceVersion(name, version) : null;
  };

  // A scoped piece name carries a slash. Serves `<name>`,
  // `<name>?version=<v>` and `<name>/versions`.
  router.get(
    PIECE_ROUTE,
    route(async (req, res) => {
      const raw = wildcard(req);
      const versionsOf = versionsRouteName(raw);
      if (versionsOf) {
        const versions = await catalog.pieceVersions(versionsOf);
        if (versions.length === 0) {
          res.status(404).json({ error: `Piece not found: ${versionsOf}` });
          return;
        }
        res.json(versions.map(versionSummary));
        return;
      }

      const name = raw;
      const version =
        typeof req.query.version === "string" ? req.query.version : undefined;
      if (version === undefined) {
        const latest = await catalog.pieceLatest(name);
        const detail = latest ? pieceDetail(latest, originOf(req)) : null;
        if (!detail) {
          res.status(404).json({ error: `Piece not found: ${name}` });
          return;
        }
        res.json(detail);
        return;
      }

      if (!(await catalog.pieceOwner(name))) {
        res.status(404).json({ error: `Piece not found: ${name}` });
        return;
      }
      const found = isExactVersion(version)
        ? await pieceAt(name, version)
        : null;
      if (!found) {
        const available = await catalog.pieceVersions(name);
        res.status(404).json({
          error: `Piece version not found: ${name}@${version}`,
          available: available.map((row) => row.version),
        });
        return;
      }
      const detail = pieceDetail(found, originOf(req));
      if (!detail) {
        res.status(404).json({ error: `Piece not found: ${name}@${version}` });
        return;
      }
      res.json(detail);
    }),
  );

  // The piece directory as an npm-shaped tarball, the one thing a reactor's
  // piece worker downloads. Named as cdn.activepieces.com names its own.
  router.get(
    BUNDLE_ROUTE,
    route(async (req, res) => {
      const params = req.params as Record<string, string>;
      const [name, version] = [params[0], params[1]];
      const row = isExactVersion(version) ? await pieceAt(name, version) : null;
      if (!row?.bundleKey) {
        res
          .status(404)
          .json({ error: `Piece bundle not found: ${name}@${version}` });
        return;
      }
      // The path carries the package version the bundle was cut from, so its
      // bytes never change.
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      const etag = `"${row.package}-${name}@${version}"`;
      res.setHeader("ETag", etag);
      if (etagMatches(req.headers["if-none-match"], etag)) {
        res.status(304).end();
        return;
      }
      res.setHeader("Content-Type", "application/gzip");
      const key = bundleKey(row.package, row.version, row.bundleFile);
      if (!(await stream(res, artifacts, key))) {
        res
          .status(404)
          .json({ error: `Piece bundle not found: ${name}@${version}` });
      }
    }),
  );

  // CDN file serving
  router.get(
    CDN_ROUTE,
    route(async (req, res) => {
      const fullPath = wildcard(req);

      // Scoped: @scope/pkg@1.0.0/file.js; unscoped: pkg@1.0.0/file.js
      const segments = fullPath.split("/");
      const scoped = fullPath.startsWith("@");
      if (scoped && segments.length < 2) {
        res.status(400).send("Invalid package path");
        return;
      }
      const specLength = scoped ? 2 : 1;
      const packageSpec = segments.slice(0, specLength).join("/");
      const filePath = segments.slice(specLength).join("/") || "index.js";

      const { name: packageName, tag } = parsePackageSpec(packageSpec);
      const pinned = isExactVersion(tag);
      // A pinned file never changes: revalidate without the database or S3
      const pinnedEtag = pinned && tag ? cdnEtag(tag, filePath) : null;
      if (pinnedEtag && etagMatches(req.headers["if-none-match"], pinnedEtag)) {
        res.setHeader("Cache-Control", IMMUTABLE);
        res.setHeader("ETag", pinnedEtag);
        res.status(304).end();
        return;
      }
      const resolution = await resolvePackageVersion(catalog, packageName, tag);
      if (resolution.kind === "upstream-error") {
        res.status(503).send("Upstream registry unavailable");
        return;
      }
      if (resolution.kind === "not-found") {
        res.status(404).send("File not found");
        return;
      }
      const version = resolution.version;
      const result = await ensure(catalog, packageName, version);
      if (sendNotReady(res, result)) return;
      const file =
        result.kind === "ready" ? resolveFile(result.row, filePath) : null;
      if (!file) {
        res.status(404).send("File not found");
        return;
      }

      // Pinned requests are immutable; dist-tag and untagged ones revalidate
      res.setHeader(
        "Cache-Control",
        pinned ? IMMUTABLE : "public, max-age=60, must-revalidate",
      );
      const etag = cdnEtag(version, filePath);
      res.setHeader("ETag", etag);
      if (etagMatches(req.headers["if-none-match"], etag)) {
        res.status(304).end();
        return;
      }

      res.setHeader("Content-Type", contentTypeOf(filePath));
      const key = filesKey(packageName, version, file);
      if (!(await stream(res, artifacts, key))) {
        res.status(404).send("File not found");
      }
    }),
  );

  return router;
}

// DELETE /<pkg>/-rev/<rev> removes the package; DELETE
// /<pkg>/-/<short-name>-<version>.tgz/-rev/<rev> removes one version
export function parseUnpublishRequest(
  reqPath: string,
): { packageName: string; version: string | null } | null {
  const revIdx = reqPath.indexOf("/-rev/");
  if (revIdx <= 0) return null;
  const beforeRev = reqPath.slice(1, revIdx); // strip leading slash

  const tarballMarker = "/-/";
  const tarballIdx = beforeRev.indexOf(tarballMarker);
  if (tarballIdx === -1) {
    // Full package: beforeRev is the package name (possibly URL-encoded scope)
    const packageName = decodeURIComponent(beforeRev);
    return { packageName, version: null };
  }

  const packageName = decodeURIComponent(beforeRev.slice(0, tarballIdx));
  const tarballName = beforeRev.slice(tarballIdx + tarballMarker.length);
  if (!tarballName.endsWith(".tgz")) return null;
  const shortName = packageName.startsWith("@")
    ? packageName.split("/")[1]
    : packageName;
  const prefix = `${shortName}-`;
  if (!tarballName.startsWith(prefix)) return null;
  const version = tarballName.slice(prefix.length, -".tgz".length);
  if (!version) return null;
  return { packageName, version };
}

// PUT /<pkg>/-rev/<rev> is npm's manifest rewrite (single-version unpublish,
// deprecate). Exclude the tarball-DELETE shape, which also carries /-rev/.
export function parseManifestRewrite(
  reqPath: string,
): { packageName: string } | null {
  const revIdx = reqPath.indexOf("/-rev/");
  if (revIdx <= 0) return null;
  const beforeRev = reqPath.slice(1, revIdx);
  if (beforeRev.includes("/-/")) return null;
  return { packageName: decodeURIComponent(beforeRev) };
}

// PUT or DELETE /-/package/<pkg>/dist-tags/<tag>
function parseDistTagChange(reqPath: string): { packageName: string } | null {
  const match = /^\/-\/package\/(.+)\/dist-tags(?:\/[^/]+)?$/.exec(reqPath);
  return match ? { packageName: decodeURIComponent(match[1]) } : null;
}

// Runs `record` once verdaccio answers 2xx, holding the response until the
// record commits so a client never sees success before the job exists
function afterSuccess(res: Response, record: () => Promise<void>): void {
  const originalEnd = res.end.bind(res) as (...args: unknown[]) => Response;
  res.end = function (this: Response, ...args: unknown[]) {
    if (res.statusCode < 200 || res.statusCode >= 300) {
      return originalEnd(...args);
    }
    record()
      .catch((err: unknown) => {
        console.error("[registry] recording a change failed:", err);
      })
      .finally(() => originalEnd(...args));
    return this;
  } as Response["end"];
}

async function queueSync(
  db: Database,
  packageName: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await enqueue(db, "sync", packageName, "", payload);
  await wakeWorkers(db);
}

// Retires the versions the storage plugin's index no longer lists, before the
// reply, so an immediate republish is refused; the worker covers setups without it
async function recordUnpublished(
  db: Database,
  packageName: string,
): Promise<void> {
  const index = await db.query<{ exists: boolean }>(
    "SELECT to_regclass('verdaccio_manifests') IS NOT NULL AS exists",
  );
  if (!index.rows[0]?.exists) return;
  await db.query(
    `INSERT INTO registry_unpublished (package, version)
     SELECT r.package, r.version
       FROM registry_versions r
       LEFT JOIN verdaccio_manifests m ON m.name = r.package
      WHERE r.package = $1 AND (m.name IS NULL OR NOT m.versions ? r.version)
     ON CONFLICT DO NOTHING`,
    [packageName],
  );
}

// Versions of a publish that were unpublished before; npm never reuses one
async function retiredVersions(
  db: Database,
  packageName: string,
  body: unknown,
): Promise<string[]> {
  const versions = Object.keys(
    (body as { versions?: Record<string, unknown> } | undefined)?.versions ??
      {},
  );
  if (versions.length === 0) return [];
  const rows = await db.query<{ version: string }>(
    `SELECT version FROM registry_unpublished
      WHERE package = $1 AND version = ANY($2)`,
    [packageName, versions],
  );
  return rows.rows.map((row) => row.version);
}

/** Queues a sync after unpublishes, manifest rewrites and dist-tag changes. */
export function createUnpublishHook(
  _config: RegistryConfig,
  services: RegistryServices,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const distTag =
      req.method === "PUT" || req.method === "DELETE"
        ? parseDistTagChange(req.path)
        : null;
    if (distTag) {
      afterSuccess(res, () => queueSync(services.db, distTag.packageName, {}));
      next();
      return;
    }
    const target =
      req.method === "PUT"
        ? parseManifestRewrite(req.path)
        : req.method === "DELETE"
          ? parseUnpublishRequest(req.path)
          : null;
    if (target) {
      afterSuccess(res, async () => {
        await recordUnpublished(services.db, target.packageName);
        await queueSync(services.db, target.packageName, {
          notify: true,
          publishedBy: publisherFromRequest(req),
        });
      });
    }
    next();
  };
}

// The tarball a publish payload carries, if it carries one: npm sends a single
// `_attachments` entry holding the base64 of the version being published.
function publishedTarball(body: unknown): Buffer | null {
  if (body === null || typeof body !== "object") return null;
  const attachments = (body as { _attachments?: Record<string, unknown> })
    ._attachments;
  if (!attachments || typeof attachments !== "object") return null;
  for (const [name, attachment] of Object.entries(attachments)) {
    if (!name.endsWith(".tgz")) continue;
    const data = (attachment as { data?: unknown }).data;
    if (typeof data === "string") return Buffer.from(data, "base64");
  }
  return null;
}

// A piece name is one package's for good: two packages claiming it would make
// a step's piece ambiguous. `@activepieces/` names are never a package's.
async function pieceClaimConflict(
  catalog: Catalog,
  packageName: string,
  body: unknown,
): Promise<string | null> {
  const tarball = publishedTarball(body);
  if (!tarball) return null;
  const names = await pieceNamesInTarball(tarball);
  if (names.length === 0) return null;
  const reserved = names.filter((name) =>
    name.startsWith(RESERVED_PIECE_SCOPE),
  );
  if (reserved.length > 0) {
    return `Piece names in the ${RESERVED_PIECE_SCOPE} scope belong to Activepieces; ${packageName} cannot claim ${reserved.map((n) => `"${n}"`).join(", ")}. Rename the piece into your own scope.`;
  }
  for (const name of names) {
    const owner = await catalog.pieceOwner(name);
    if (owner && owner !== packageName) {
      return `Piece "${name}" is already published by ${owner}; ${packageName} cannot claim it.`;
    }
  }
  return null;
}

// The version and its processing job, committed together
async function recordPublish(
  db: Database,
  packageName: string,
  version: string,
  publishedBy: PublisherIdentity | undefined,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query(
      `INSERT INTO registry_packages (name, local) VALUES ($1, true)
       ON CONFLICT (name) DO UPDATE SET local = true`,
      [packageName],
    );
    await tx.query(
      `INSERT INTO registry_versions (package, version, status)
       VALUES ($1, $2, 'pending')
       ON CONFLICT (package, version) DO UPDATE SET status = 'pending', error = NULL
         WHERE registry_versions.status = 'failed'`,
      [packageName, version],
    );
    await enqueue(tx, "process", packageName, version, {
      local: true,
      notify: true,
      ...(publishedBy ? { publishedBy } : {}),
    });
  });
  await wakeWorkers(db);
}

export function createPublishHook(
  config: RegistryConfig,
  services: RegistryServices,
) {
  // Publish bodies are read here, ahead of verdaccio: body-parser marks the
  // request parsed, so verdaccio reuses this one instead of a spent stream.
  const parseBody = express.json({
    strict: false,
    limit: config.maxBodySize ?? "300mb",
  });

  const recordOnSuccess = (
    req: Request,
    res: Response,
    packageName: string,
  ) => {
    const versions = Object.keys(
      (req.body as { versions?: Record<string, unknown> } | undefined)
        ?.versions ?? {},
    );
    const version = versions.at(0);
    if (!version) return;
    if (versions.length > 1) {
      console.warn(
        `[registry] Multiple versions published for ${packageName}: ${JSON.stringify(versions)}`,
      );
    }
    const publishedBy = publisherFromRequest(req);
    afterSuccess(res, () =>
      recordPublish(services.db, packageName, version, publishedBy),
    );
  };

  return (req: Request, res: Response, next: NextFunction) => {
    // Only npm publish endpoints: a PUT to `/<pkg>/-rev/<rev>` is the
    // manifest rewrite of a single-version unpublish, not a new publish.
    if (req.method !== "PUT" || req.path.includes("/-rev/")) {
      next();
      return;
    }
    const urlPath = req.path.replace(/^\//, "");
    if (!urlPath || urlPath.startsWith("-")) {
      next();
      return;
    }
    const packageName = decodeURIComponent(urlPath);

    parseBody(req, res, (parseError?: unknown) => {
      // A body verdaccio will reject anyway: let it own the error message.
      if (parseError) {
        next();
        return;
      }
      void retiredVersions(services.db, packageName, req.body)
        .then(async (retired) =>
          retired.length > 0
            ? `${packageName}@${retired.join(", ")} was unpublished and cannot be published again. Publish a new version.`
            : pieceClaimConflict(services.catalog, packageName, req.body),
        )
        .then((conflict) => {
          if (conflict) {
            res.status(409).json({ error: conflict });
            return;
          }
          recordOnSuccess(req, res, packageName);
          next();
        })
        .catch((err: unknown) => {
          console.error("[registry] publish checks failed:", err);
          recordOnSuccess(req, res, packageName);
          next();
        });
    });
  };
}
