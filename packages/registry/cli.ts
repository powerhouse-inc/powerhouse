import {
  binary,
  command,
  flag,
  number,
  option,
  optional,
  run,
  string,
} from "cmd-ts";
import {
  DEFAULT_PORT,
  DEFAULT_REGISTRY_CDN_CACHE_DIR_NAME,
  DEFAULT_STORAGE_DIR_NAME,
} from "./src/constants.js";
import { runRegistry } from "./src/run.js";

export const registryCommand = command({
  name: "Package registry",
  args: {
    port: option({
      long: "port",
      type: number,
      defaultValue: () => Number(process.env.PORT) || DEFAULT_PORT,
      defaultValueIsSerializable: true,
    }),
    storageDir: option({
      long: "storage-dir",
      type: string,
      defaultValue: () =>
        process.env.REGISTRY_STORAGE || DEFAULT_STORAGE_DIR_NAME,
      defaultValueIsSerializable: true,
    }),
    cdnCacheDir: option({
      long: "cdn-cache-dir",
      type: string,
      defaultValue: () =>
        process.env.REGISTRY_CDN_CACHE || DEFAULT_REGISTRY_CDN_CACHE_DIR_NAME,
      defaultValueIsSerializable: true,
    }),
    uplink: option({
      long: "uplink",
      type: optional(string),
      defaultValue: () => process.env.REGISTRY_UPLINK,
      defaultValueIsSerializable: true,
    }),
    uplinkMaxage: option({
      long: "uplink-maxage",
      type: optional(string),
      description:
        "How long verdaccio caches npmjs uplink metadata before refetching. " +
        "Accepts verdaccio time strings (e.g. '30s', '2m', '1h'). " +
        "Default '2m' matches verdaccio upstream — shortens the publish-to-" +
        "install propagation window in dev. Bump for production deployments " +
        "that want to reduce npmjs load.",
      defaultValue: () => process.env.PH_REGISTRY_UPLINK_MAXAGE,
      defaultValueIsSerializable: true,
    }),
    s3Bucket: option({
      long: "s3-bucket",
      type: optional(string),
      defaultValue: () => process.env.S3_BUCKET,
      defaultValueIsSerializable: true,
    }),
    s3Endpoint: option({
      long: "s3-endpoint",
      type: optional(string),
      defaultValue: () => process.env.S3_ENDPOINT,
      defaultValueIsSerializable: true,
    }),
    s3Region: option({
      long: "s3-region",
      type: optional(string),
      defaultValue: () => process.env.S3_REGION,
      defaultValueIsSerializable: true,
    }),
    s3AccessKeyId: option({
      long: "s3-access-key-id",
      type: optional(string),
      defaultValue: () => process.env.S3_ACCESS_KEY_ID,
      defaultValueIsSerializable: true,
    }),
    s3SecretAccessKey: option({
      long: "s3-secret-access-key",
      type: optional(string),
      defaultValue: () => process.env.S3_SECRET_ACCESS_KEY,
      defaultValueIsSerializable: true,
    }),
    s3KeyPrefix: option({
      long: "s3-key-prefix",
      type: optional(string),
      defaultValue: () => process.env.S3_KEY_PREFIX,
      defaultValueIsSerializable: true,
    }),
    s3ForcePathStyle: flag({
      long: "s3-force-path-style",
      defaultValue: () => process.env.S3_FORCE_PATH_STYLE !== "false",
      defaultValueIsSerializable: true,
    }),
    webEnabled: flag({
      long: "web-enabled",
      defaultValue: () => process.env.REGISTRY_WEB !== "false",
      defaultValueIsSerializable: true,
    }),
    webhooks: option({
      long: "webhook",
      type: optional(string),
      description: "Comma-separated webhook URLs to notify on publish",
      defaultValue: () => process.env.REGISTRY_WEBHOOKS,
      defaultValueIsSerializable: true,
    }),
    publicUrl: option({
      long: "public-url",
      type: optional(string),
      description:
        "Public origin of this registry (used as the JWT `aud` claim for Renown bearer tokens). Required when --auth-renown is true.",
      defaultValue: () => process.env.PH_REGISTRY_PUBLIC_URL,
      defaultValueIsSerializable: true,
    }),
    authRenown: flag({
      long: "auth-renown",
      description:
        "Verify Renown-signed bearer tokens in front of verdaccio (stateless). Disabled when --public-url is unset.",
      defaultValue: () => process.env.PH_REGISTRY_AUTH_RENOWN === "true",
      defaultValueIsSerializable: true,
    }),
    verdaccioSecret: option({
      long: "verdaccio-secret",
      type: optional(string),
      description:
        "Override verdaccio's internal JWT signing secret. Default: random per pod (fine — the swapped JWT never leaves this process).",
      defaultValue: () => process.env.PH_REGISTRY_VERDACCIO_SECRET,
      defaultValueIsSerializable: true,
    }),
    localPackages: option({
      long: "local-packages",
      type: optional(string),
      description:
        "Comma-separated globs (e.g. '@powerhousedao/*,document-model,ph-cmd') served locally only — no npmjs uplink proxy. Lets you re-publish a workspace package whose version already exists on npmjs without bumping.",
      defaultValue: () => process.env.PH_REGISTRY_LOCAL_PACKAGES,
      defaultValueIsSerializable: true,
    }),
  },
  handler: async (args) => {
    console.log(args);

    try {
      await runRegistry(args);
    } catch (error) {
      console.error("Failed to start registry:");
      console.error(error);
      process.exit(1);
    }
  },
});

const registryCli = binary(registryCommand);

await run(registryCli, process.argv);
