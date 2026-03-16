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
