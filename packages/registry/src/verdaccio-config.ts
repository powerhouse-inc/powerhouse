import path from "node:path";
import { fileURLToPath } from "node:url";
import type { RegistryConfig } from "./types.js";

export function buildVerdaccioConfig(config: RegistryConfig) {
  const htpasswdPath = path.join(config.storagePath, "htpasswd");

  const uplinkUrl = config.uplink ?? "https://registry.npmjs.org/";

  // With S3 configured, use the S3-backed auth plugin (persistent accounts +
  // npm-style package ownership). Verdaccio loads it via require() from the
  // dist/plugins dir — a `.js` marked CommonJS by dist/plugins/package.json.
  // Without S3 (local dev / tests), keep the built-in htpasswd path.
  const useS3Auth = Boolean(config.s3);
  const pluginsDir =
    config.pluginsDir ??
    path.join(path.dirname(fileURLToPath(import.meta.url)), "plugins");
  const auth = useS3Auth
    ? { "s3-auth": { s3: config.s3 } }
    : { htpasswd: { file: htpasswdPath } };

  const base: Record<string, unknown> = {
    storage: config.storagePath,
    self_path: "./",
    // Top-level secret used by verdaccio to sign / verify its API JWTs.
    // The renown middleware mints a verdaccio-format JWT with the same
    // secret so verdaccio's apiJWTmiddleware accepts the swapped token.
    ...(config.verdaccioSecret ? { secret: config.verdaccioSecret } : {}),
    // Force JWT mode for the npm API. Without this verdaccio falls back to
    // its legacy aes-encrypted token format, which signPayload won't produce.
    security: {
      api: {
        jwt: {
          sign: { expiresIn: "90d" },
          verify: {},
        },
      },
    },
    auth,
    ...(useS3Auth ? { plugins: pluginsDir } : {}),
    uplinks: {
      npmjs: {
        url: uplinkUrl,
        // Defaults to verdaccio's own default of 2m. The previous 15m
        // hardcoded value made publish-to-install dev loops painful —
        // when a newly-published version landed on npmjs, our registry
        // kept handing out the pre-publish packument for up to 15min.
        // Operators that want heavier upstream caching for production
        // can opt in via --uplink-maxage / PH_REGISTRY_UPLINK_MAXAGE.
        maxage: config.uplinkMaxage ?? "2m",
        timeout: "30s",
        cache: true,
      },
    },
    // Verdaccio matches packages config top-to-bottom (first match wins),
    // so local-only globs must come first. We also skip emitting the
    // default proxied entries when a glob with the same key is in the
    // local-only list — otherwise the value would be overwritten but the
    // iteration position would still be the default's earlier slot.
    packages: (() => {
      const local = config.localPackagePatterns ?? [];
      const localSet = new Set(local);
      const access = {
        access: "$all",
        publish: "$authenticated",
        unpublish: "$authenticated",
      };
      const entries: [string, Record<string, unknown>][] = [];
      // Locals first — no proxy means verdaccio resolves them from local
      // storage only, so re-publishing a version that exists on npmjs
      // doesn't 409.
      for (const pattern of local) {
        entries.push([pattern, { ...access }]);
      }
      // Defaults follow, skipping any glob the caller already overrode.
      if (!localSet.has("@powerhousedao/*")) {
        entries.push(["@powerhousedao/*", { ...access, proxy: "npmjs" }]);
      }
      if (!localSet.has("**")) {
        entries.push(["**", { ...access, proxy: "npmjs" }]);
      }
      return Object.fromEntries(entries);
    })(),
    web: {
      enable: config.webEnabled !== false,
      title: "Powerhouse Registry",
      logo: "https://raw.githubusercontent.com/powerhouse-inc/powerhouse/main/packages/registry/static/logo.svg",
      favicon: "/-/static/favicon.ico",
      primary_color: "#38C780",
      darkMode: true,
    },
    server: {
      keepAliveTimeout: 60,
    },
    log: {
      type: "stdout",
      format: "pretty",
      level: "warn",
    },
    max_body_size: config.maxBodySize ?? "300mb",
  };

  if (config.s3) {
    base.store = {
      "aws-s3-storage": {
        bucket: config.s3.bucket,
        endpoint: config.s3.endpoint,
        region: config.s3.region,
        s3ForcePathStyle: config.s3.s3ForcePathStyle ?? true,
        ...(config.s3.keyPrefix && { keyPrefix: config.s3.keyPrefix }),
        ...(config.s3.accessKeyId && { accessKeyId: config.s3.accessKeyId }),
        ...(config.s3.secretAccessKey && {
          secretAccessKey: config.s3.secretAccessKey,
        }),
      },
    };
  }

  return base;
}
