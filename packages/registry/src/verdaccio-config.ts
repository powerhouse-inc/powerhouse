import path from "node:path";
import type { RegistryConfig } from "./types.js";

export function buildVerdaccioConfig(config: RegistryConfig) {
  const htpasswdPath = path.join(config.storagePath, "htpasswd");

  const base: Record<string, unknown> = {
    storage: config.storagePath,
    self_path: "./",
    auth: {
      htpasswd: {
        file: htpasswdPath,
      },
    },
    uplinks: {
      npmjs: {
        url: "https://registry.npmjs.org/",
      },
    },
    packages: {
      "@powerhousedao/*": {
        access: "$all",
        publish: "$authenticated",
        unpublish: "$authenticated",
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
    max_body_size: "100mb",
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
