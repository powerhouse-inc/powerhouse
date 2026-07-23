export const DEFAULT_S3_ATTACHMENT_PREFIX = "attachments";
export const DEFAULT_S3_UPLOAD_TTL_SECONDS = 900;
export const DEFAULT_S3_DOWNLOAD_TTL_SECONDS = 300;
export const MAX_S3_PRESIGN_TTL_SECONDS = 604_800;

export type S3AttachmentConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix: string;
  forcePathStyle: boolean;
  uploadTtlSeconds: number;
  downloadTtlSeconds: number;
};

export type AttachmentStorageConfig =
  | { kind: "filesystem" }
  | { kind: "s3"; s3: S3AttachmentConfig };

type Environment = Readonly<Record<string, string | undefined>>;

function required(env: Environment, name: string): string {
  const value = env[name];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${name} is required and must not be blank`);
  }
  if (value.trim() !== value) {
    throw new Error(`${name} must not have leading or trailing whitespace`);
  }
  return value;
}

const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** Plain HTTP is allowed only for loopback hosts (local S3 emulators). */
function isLoopbackHost(endpoint: URL): boolean {
  return LOOPBACK_HOSTNAMES.has(endpoint.hostname.toLowerCase());
}

function parseEndpoint(value: string): string {
  const message =
    "PH_ATTACHMENT_S3_ENDPOINT must be a valid HTTPS URL (HTTP is allowed only for loopback hosts)";
  let endpoint: URL;
  try {
    endpoint = new URL(value);
  } catch {
    throw new Error(message);
  }
  const protocolAllowed =
    endpoint.protocol === "https:" ||
    (endpoint.protocol === "http:" && isLoopbackHost(endpoint));
  if (
    value.trim() !== value ||
    !protocolAllowed ||
    endpoint.username !== "" ||
    endpoint.password !== "" ||
    endpoint.search !== "" ||
    endpoint.hash !== ""
  ) {
    throw new Error(message);
  }
  return endpoint.toString().replace(/\/$/, "");
}

function parseBoolean(
  env: Environment,
  name: string,
  defaultValue: boolean,
): boolean {
  const value = env[name];
  if (value === undefined) return defaultValue;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be either true or false`);
}

function parseTtl(
  env: Environment,
  name: string,
  defaultValue: number,
): number {
  const value = env[name];
  if (value === undefined) return defaultValue;
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error(`${name} must be a positive integer`);
  }
  const seconds = Number(value);
  if (!Number.isSafeInteger(seconds) || seconds > MAX_S3_PRESIGN_TTL_SECONDS) {
    throw new Error(
      `${name} must be between 1 and ${MAX_S3_PRESIGN_TTL_SECONDS}`,
    );
  }
  return seconds;
}

export function normalizeS3AttachmentPrefix(prefix: string): string {
  if (
    prefix.trim() !== prefix ||
    prefix.startsWith("/") ||
    prefix.includes("\\")
  ) {
    throw new Error("S3_ATTACHMENT_PREFIX is unsafe");
  }
  const normalized = prefix.replace(/\/+$/, "");
  if (normalized.length === 0) {
    throw new Error("S3_ATTACHMENT_PREFIX must not be blank");
  }
  const segments = normalized.split("/");
  if (
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment === "." ||
        segment === ".." ||
        !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment),
    )
  ) {
    throw new Error("S3_ATTACHMENT_PREFIX contains an unsafe segment");
  }
  return segments.join("/");
}

export function parseAttachmentStorageConfig(
  env: Environment = process.env,
): AttachmentStorageConfig {
  const selector = env.PH_ATTACHMENT_STORAGE;
  if (selector === undefined || selector === "filesystem") {
    return { kind: "filesystem" };
  }
  if (selector !== "s3") {
    throw new Error("PH_ATTACHMENT_STORAGE must be either filesystem or s3");
  }

  return {
    kind: "s3",
    s3: {
      endpoint: parseEndpoint(required(env, "PH_ATTACHMENT_S3_ENDPOINT")),
      region: required(env, "PH_ATTACHMENT_S3_REGION"),
      bucket: required(env, "PH_ATTACHMENT_S3_BUCKET"),
      accessKeyId: required(env, "PH_ATTACHMENT_S3_ACCESS_KEY_ID"),
      secretAccessKey: required(env, "PH_ATTACHMENT_S3_SECRET_ACCESS_KEY"),
      prefix: normalizeS3AttachmentPrefix(
        env.S3_ATTACHMENT_PREFIX ?? DEFAULT_S3_ATTACHMENT_PREFIX,
      ),
      forcePathStyle: parseBoolean(
        env,
        "PH_ATTACHMENT_S3_FORCE_PATH_STYLE",
        false,
      ),
      uploadTtlSeconds: parseTtl(
        env,
        "PH_ATTACHMENT_S3_UPLOAD_TTL_SECONDS",
        DEFAULT_S3_UPLOAD_TTL_SECONDS,
      ),
      downloadTtlSeconds: parseTtl(
        env,
        "PH_ATTACHMENT_S3_DOWNLOAD_TTL_SECONDS",
        DEFAULT_S3_DOWNLOAD_TTL_SECONDS,
      ),
    },
  };
}
