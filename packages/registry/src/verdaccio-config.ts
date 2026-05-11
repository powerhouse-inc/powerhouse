import path from "node:path";
import type { RegistryConfig } from "./types.js";

export function buildVerdaccioConfig(config: RegistryConfig) {
  const htpasswdPath = path.join(config.storagePath, "htpasswd");

  const uplinkUrl = config.uplink ?? "https://registry.npmjs.org/";

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
          sign: { expiresIn: "5m" },
          verify: {},
        },
      },
    },
    auth: {
      htpasswd: {
        file: htpasswdPath,
      },
    },
    uplinks: {
      npmjs: {
        url: uplinkUrl,
        maxage: "15m",
        timeout: "30s",
        cache: true,
      },
    },
    packages: {
      "@powerhousedao/*": {
        access: "$all",
        publish: "$authenticated",
        unpublish: "$authenticated",
        proxy: "npmjs",
      },
      "**": {
        access: "$all",
        publish: "$authenticated",
        unpublish: "$authenticated",
        proxy: "npmjs",
      },
    },
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
