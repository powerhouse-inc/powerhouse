import path from "node:path";
import type { RegistryConfig } from "./types.js";

export interface BuildVerdaccioConfigOptions {
  /** Absolute path to the directory containing our verdaccio plugin folder
   *  (`<pluginsPath>/verdaccio-auth-renown/`). Required when Renown auth is
   *  enabled — verdaccio's loader resolves plugins from this path. */
  pluginsPath?: string;
}

export function buildVerdaccioConfig(
  config: RegistryConfig,
  opts: BuildVerdaccioConfigOptions = {},
) {
  const htpasswdPath = path.join(config.storagePath, "htpasswd");

  const uplinkUrl = config.uplink ?? "https://registry.npmjs.org/";

  // Build the auth plugin chain. When Renown is enabled, our plugin sits
  // first — its apiJWTmiddleware completely replaces verdaccio's default
  // (no secret synchronization to manage). htpasswd remains as a grace-
  // period fallback for any clients still on the legacy flow.
  const auth: Record<string, unknown> = {};
  if (config.renown) {
    auth["auth-renown"] = { publicUrl: config.renown.publicUrl };
  }
  auth.htpasswd = { file: htpasswdPath };

  const base: Record<string, unknown> = {
    storage: config.storagePath,
    self_path: "./",
    ...(opts.pluginsPath ? { plugins: opts.pluginsPath } : {}),
    auth,
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
