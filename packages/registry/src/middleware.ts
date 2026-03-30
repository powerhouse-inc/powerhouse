import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { CdnCache } from "./cdn.js";
import type { NotificationChannel } from "./notifications/types.js";
import type { SSEChannel } from "./notifications/sse.js";
import type { WebhookChannel } from "./notifications/webhook.js";
import {
  findPackagesByDocumentType,
  loadPackage,
  scanPackages,
} from "./packages.js";
import type { RegistryConfig } from "./types.js";

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

  // Package listing API
  router.get("/packages", (req: Request, res: Response) => {
    const packages = scanPackages(config.cdnCachePath);
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
  router.get("/packages/*name", (req: Request, res: Response) => {
    const name = (req.params as Record<string, string[]>).name.join("/");
    const pkg = loadPackage(config.cdnCachePath, name);
    if (!pkg) {
      res.status(404).send("Package not found");
      return;
    }
    res.json(pkg);
  });

  // CDN file serving
  router.get("/-/cdn/*path", async (req: Request, res: Response) => {
    const parts = (req.params as Record<string, string[]>).path;
    const fullPath = parts.join("/");

    // Parse scoped or unscoped package name from the path
    let packageName: string;
    let filePath: string;

    if (fullPath.startsWith("@")) {
      // Scoped: @scope/pkg/file.js -> packageName = @scope/pkg, filePath = file.js
      const segments = fullPath.split("/");
      if (segments.length < 2) {
        res.status(400).send("Invalid package path");
        return;
      }
      packageName = `${segments[0]}/${segments[1]}`;
      filePath = segments.slice(2).join("/") || "index.js";
    } else {
      // Unscoped: pkg/file.js -> packageName = pkg, filePath = file.js
      const segments = fullPath.split("/");
      packageName = segments[0];
      filePath = segments.slice(1).join("/") || "index.js";
    }

    const resolved = await cdn.getFile(packageName, filePath);
    if (!resolved) {
      res.status(404).send("File not found");
      return;
    }

    res.setHeader("Content-Type", getContentType(filePath));
    const content = fs.readFileSync(resolved);
    res.send(content);
  });

  return router;
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
    // Only intercept PUT requests to npm publish endpoints
    if (req.method !== "PUT") {
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
        const urlPath = req.path.replace(/^\//, "");
        if (urlPath && !urlPath.startsWith("-/")) {
          const packageName = decodeURIComponent(urlPath);
          console.log(`[registry] Invalidating CDN cache for ${packageName}`);
          cdn.invalidate(packageName);
          // Extract tarball immediately so /packages lists the package right away
          cdn
            .getLatestVersion(packageName)
            .then((version) => {
              if (version) {
                console.log(
                  `[registry] Extracting ${packageName}@${version} to CDN cache`,
                );
                return cdn.extractTarball(packageName, version).then(() => {
                  // Remove any stale version directories left by racing CDN requests
                  cdn.pruneOldVersions(packageName, version);
                  return version;
                });
              }
              return null;
            })
            .then((version) => {
              notifications.notifyPublish({ packageName, version });
            })
            .catch((err) => {
              console.error(
                `[registry] Failed to extract ${packageName} to CDN cache:`,
                err,
              );
            });
        }
      }
      return originalEnd(chunk, encoding as BufferEncoding, cb);
    };

    next();
  };
}
