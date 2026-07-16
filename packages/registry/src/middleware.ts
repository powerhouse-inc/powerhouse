import express, {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { CdnCache, isExactVersion, parsePackageSpec } from "./cdn.js";
import type { SSEChannel } from "./notifications/sse.js";
import type { NotificationChannel } from "./notifications/types.js";
import type { WebhookChannel } from "./notifications/webhook.js";
import {
  findPackagesByDocumentType,
  loadPackage,
  scanPackages,
} from "./packages.js";
import type { RegistryConfig } from "./types.js";
import { createWarmer } from "./warmup.js";

const MIME_TYPES: Record<string, string> = {
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".map": "application/json",
  ".html": "text/html",
  ".svg": "image/svg+xml",
};

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

type VersionResolution =
  | { kind: "ok"; version: string }
  | { kind: "not-found" }
  | { kind: "upstream-error" };

/**
 * Resolve a package version. Exact versions skip the network call. Upstream
 * errors fall back to the latest cached version; genuine not-found falls back
 * too, then reports not-found.
 */
async function resolvePackageVersion(
  cdn: CdnCache,
  packageName: string,
  tag: string | undefined,
): Promise<VersionResolution> {
  if (tag && isExactVersion(tag)) return { kind: "ok", version: tag };

  try {
    const resolved =
      (await cdn.resolveVersion(packageName, tag)) ??
      cdn.getLatestCachedVersion(packageName);
    if (!resolved) return { kind: "not-found" };
    return { kind: "ok", version: resolved };
  } catch {
    const cached = cdn.getLatestCachedVersion(packageName);
    if (!cached) return { kind: "upstream-error" };
    return { kind: "ok", version: cached };
  }
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

export function createPowerhouseRouter(
  config: RegistryConfig,
  sse: SSEChannel,
  webhooks: WebhookChannel,
): Router {
  const cdn = new CdnCache(
    `http://localhost:${config.port}`,
    config.cdnCachePath,
  );
  const router = Router();

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
  router.get("/-/webhooks", (_req: Request, res: Response) => {
    res.json(webhooks.getWebhooks());
  });

  router.post("/-/webhooks", express.json(), (req: Request, res: Response) => {
    const { endpoint, headers } = req.body as {
      endpoint?: string;
      headers?: Record<string, string>;
    };
    if (!endpoint) {
      res.status(400).json({ error: "Missing required field: endpoint" });
      return;
    }
    webhooks.addWebhook({ endpoint, headers });
    res.status(201).json({ endpoint, headers });
  });

  router.delete(
    "/-/webhooks",
    express.json(),
    (req: Request, res: Response) => {
      const { endpoint } = req.body as { endpoint?: string };
      if (!endpoint) {
        res.status(400).json({ error: "Missing required field: endpoint" });
        return;
      }
      const removed = webhooks.removeWebhook(endpoint);
      if (!removed) {
        res.status(404).json({ error: "Webhook not found" });
        return;
      }
      res.status(204).end();
    },
  );

  const warm = createWarmer(config, cdn);

  // Kick off an initial warm so /packages is useful soon after pod start
  // even if no clients hit it. Fire-and-forget — must not block the listener.
  void warm();

  // Package listing API.
  // Returns whatever's currently in the local cdn-cache (instant response —
  // important: this endpoint is wired to the deployment's readiness probe,
  // so it must not synchronously fetch or extract). Each call also nudges
  // a background warm-up so newly-published packages appear in the listing
  // without operator intervention.
  router.get("/packages", (req: Request, res: Response) => {
    void warm();
    const packages = scanPackages(config.cdnCachePath, config.storagePath);
    const documentType = req.query.documentType as string | undefined;
    if (documentType) {
      const filtered = packages.filter((pkg) =>
        pkg.manifest?.documentModels?.some((m) => m.id === documentType),
      );
      res.json(filtered);
      return;
    }
    res.json(packages);
  });

  // Find packages by document type - returns array of package names
  router.get("/packages/by-document-type", (req: Request, res: Response) => {
    const documentType = req.query.type;

    if (typeof documentType !== "string" || !documentType) {
      res.status(400).json({ error: "Missing required query parameter: type" });
      return;
    }

    const packages = findPackagesByDocumentType(
      config.cdnCachePath,
      documentType,
    );
    const packageNames = packages.map((pkg) => pkg.name);
    res.json(packageNames);
  });

  // Single package info
  router.get("/packages/*", async (req: Request, res: Response) => {
    const raw = (req.params as Record<string, string>)[0];
    const { name, tag } = parsePackageSpec(raw);
    const resolution = await resolvePackageVersion(cdn, name, tag);
    if (resolution.kind === "upstream-error") {
      res.status(503).send("Upstream registry unavailable");
      return;
    }
    const version = resolution.kind === "ok" ? resolution.version : undefined;
    const pkg = loadPackage(config.cdnCachePath, name, version);
    if (!pkg) {
      res.status(404).send("Package not found");
      return;
    }
    res.json(pkg);
  });

  // CDN file serving
  router.get("/-/cdn/*", async (req: Request, res: Response) => {
    const fullPath = (req.params as Record<string, string>)[0];

    // Parse scoped or unscoped package specifier from the path
    let packageSpec: string;
    let filePath: string;

    if (fullPath.startsWith("@")) {
      // Scoped: @scope/pkg@1.0.0/file.js -> packageSpec = @scope/pkg@1.0.0, filePath = file.js
      const segments = fullPath.split("/");
      if (segments.length < 2) {
        res.status(400).send("Invalid package path");
        return;
      }
      packageSpec = `${segments[0]}/${segments[1]}`;
      filePath = segments.slice(2).join("/") || "index.js";
    } else {
      // Unscoped: pkg@1.0.0/file.js -> packageSpec = pkg@1.0.0, filePath = file.js
      const segments = fullPath.split("/");
      packageSpec = segments[0];
      filePath = segments.slice(1).join("/") || "index.js";
    }

    const { name: packageName, tag } = parsePackageSpec(packageSpec);
    const pinned = isExactVersion(tag);
    const resolution = await resolvePackageVersion(cdn, packageName, tag);
    if (resolution.kind === "upstream-error") {
      res.status(503).send("Upstream registry unavailable");
      return;
    }
    if (resolution.kind === "not-found") {
      res.status(404).send("File not found");
      return;
    }
    const version = resolution.version;

    const resolved = await cdn.getFileByVersion(packageName, version, filePath);
    if (!resolved) {
      // Pinned requests skip the metadata lookup above, so a miss here may be
      // an upstream failure rather than a genuine 404 — probe to distinguish,
      // otherwise the CDN would cache a 404 while upstream is merely down.
      if (pinned) {
        try {
          await cdn.resolveVersion(packageName, tag);
        } catch {
          res.status(503).send("Upstream registry unavailable");
          return;
        }
      }
      res.status(404).send("File not found");
      return;
    }

    // Cache based on the request shape: pinned requests are immutable, moving
    // ones (dist-tag / untagged) must revalidate frequently.
    res.setHeader(
      "Cache-Control",
      pinned
        ? "public, max-age=31536000, immutable"
        : "public, max-age=60, must-revalidate",
    );

    // Hash the file path: it comes from the URL and may contain characters
    // that are invalid in header values.
    const fileHash = crypto
      .createHash("sha1")
      .update(filePath)
      .digest("hex")
      .slice(0, 16);
    const etag = `W/"${version}-${fileHash}"`;
    res.setHeader("ETag", etag);
    if (etagMatches(req.headers["if-none-match"], etag)) {
      res.status(304).end();
      return;
    }

    res.setHeader("Content-Type", getContentType(filePath));
    try {
      await pipeline(fs.createReadStream(resolved), res);
    } catch {
      // Stream failure (I/O error, client abort) after headers may already
      // be sent — destroy the socket so the request doesn't hang.
      res.destroy();
    }
  });

  return router;
}

/**
 * Parse verdaccio's unpublish URL shape:
 *   DELETE /<pkg>/-rev/<rev>                           → full package
 *   DELETE /<pkg>/-/<tarball-name>/-rev/<rev>          → single version
 * where <pkg> may be scoped (@scope%2Fname, encoded) or unscoped, and the
 * tarball name is `<short-name>-<version>.tgz`.
 */
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

export function createUnpublishHook(
  config: RegistryConfig,
  notifications: NotificationChannel,
) {
  const cdn = new CdnCache(
    `http://localhost:${config.port}`,
    config.cdnCachePath,
  );

  // Reconcile the CDN cache after verdaccio rewrites a manifest to drop a
  // version. Re-fetch survivors — req.body isn't reliable on this route.
  const handleManifestRewrite = (req: Request, res: Response) => {
    const rewrite = parseManifestRewrite(req.path);
    if (!rewrite) return;

    const originalEnd = res.end.bind(res);
    res.end = function (
      this: Response,
      chunk?: unknown,
      encoding?: unknown,
      cb?: () => void,
    ) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const renownUser = req.renownUser;
        const publishedBy = renownUser
          ? { address: renownUser.address, did: renownUser.did }
          : undefined;
        cdn
          .reconcileWithRegistry(rewrite.packageName)
          .then((removed) => {
            for (const version of removed) {
              notifications.notifyUnpublish({
                packageName: rewrite.packageName,
                version,
                publishedBy,
              });
            }
          })
          .catch((err) => {
            console.error(
              `[registry] CDN reconcile failed for ${rewrite.packageName}:`,
              err,
            );
          });
      }
      return originalEnd(chunk, encoding as BufferEncoding, cb);
    };
  };

  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method === "PUT") {
      handleManifestRewrite(req, res);
      next();
      return;
    }
    if (req.method !== "DELETE") {
      next();
      return;
    }

    const parsed = parseUnpublishRequest(req.path);
    if (!parsed) {
      next();
      return;
    }

    const originalEnd = res.end.bind(res);
    res.end = function (
      this: Response,
      chunk?: unknown,
      encoding?: unknown,
      cb?: () => void,
    ) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          if (parsed.version) {
            cdn.invalidateVersion(parsed.packageName, parsed.version);
          } else {
            cdn.invalidate(parsed.packageName);
          }
          const renownUser = req.renownUser;
          notifications.notifyUnpublish({
            packageName: parsed.packageName,
            version: parsed.version,
            publishedBy: renownUser
              ? { address: renownUser.address, did: renownUser.did }
              : undefined,
          });
        } catch (err) {
          console.error(
            `[registry] CDN purge failed for ${parsed.packageName}${parsed.version ? `@${parsed.version}` : ""}:`,
            err,
          );
        }
      }
      return originalEnd(chunk, encoding as BufferEncoding, cb);
    };

    next();
  };
}

export function createPublishHook(
  config: RegistryConfig,
  notifications: NotificationChannel,
) {
  const cdn = new CdnCache(
    `http://localhost:${config.port}`,
    config.cdnCachePath,
  );

  return (req: Request, res: Response, next: NextFunction) => {
    // Only intercept PUT requests to npm publish endpoints.
    // Skip PUTs to `/<pkg>/-rev/<rev>` — those are npm's manifest-rewrite
    // step during single-version unpublish, not a new publish.
    if (req.method !== "PUT" || req.path.includes("/-rev/")) {
      next();
      return;
    }

    const originalEnd = res.end.bind(res);
    res.end = function (
      this: Response,
      chunk?: unknown,
      encoding?: unknown,
      cb?: () => void,
    ) {
      const urlPath = req.path.replace(/^\//, "");
      if (
        res.statusCode < 200 ||
        res.statusCode >= 300 ||
        !urlPath ||
        urlPath.startsWith("-")
      ) {
        return originalEnd(chunk, encoding as BufferEncoding, cb);
      }
      const packageName = decodeURIComponent(urlPath);
      const versionsObj = (req.body as { versions: Record<string, unknown> })
        .versions;
      const versions = Object.keys(versionsObj);
      const version = versions.at(0);
      if (!version) {
        console.error(`[registry] No version found for ${packageName}`);
        return originalEnd(chunk, encoding as BufferEncoding, cb);
      }
      if (versions.length > 1) {
        console.warn(
          `[registry] Multiple versions published for ${packageName}: ${JSON.stringify(versions)}`,
        );
      }

      const renownUser = req.renownUser;
      const publishedBy = renownUser
        ? { address: renownUser.address, did: renownUser.did }
        : undefined;
      cdn
        .extractTarball(packageName, version)
        .then(() => {
          notifications.notifyPublish({ packageName, version, publishedBy });
        })
        .catch((err) => {
          console.error(
            `[registry] Failed to extract ${packageName} to CDN cache:`,
            err,
          );
        });

      return originalEnd(chunk, encoding as BufferEncoding, cb);
    };

    next();
  };
}
