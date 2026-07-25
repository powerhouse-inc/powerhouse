import { createHash } from "node:crypto";
import {
  S3AttachmentPrimitives,
  parseAttachmentStorageConfig,
  type S3AttachmentConfig,
} from "../src/storage/s3/index.js";
import type {
  AttachmentDownloadTarget,
  AttachmentUploadTarget,
} from "../src/types.js";

export const S3_COMPATIBILITY_CASES = [
  "correct bytes",
  "wrong bytes",
  "omitted checksum header",
  "changed checksum header",
  "HEAD found",
  "HEAD not-found",
  "HEAD auth failure",
  "pre-expiry GET+rehash",
  "expired URLs",
  "unsigned GET",
  "wrong credentials",
  "allowed Origin preflight",
  "denied Origin preflight",
] as const;

type CaseName = (typeof S3_COMPATIBILITY_CASES)[number];
type CaseRunner = (name: CaseName) => Promise<boolean>;
type Reporter = (line: string) => void;

type ProbePrimitives = {
  createUploadTarget(
    hash: string,
    mimeType: string,
    ttlSeconds?: number,
  ): Promise<AttachmentUploadTarget>;
  createDownloadTarget(
    hash: string,
    ttlSeconds?: number,
  ): Promise<AttachmentDownloadTarget>;
  headObject(hash: string): Promise<unknown>;
};

export type S3CompatibilityProbeOptions = {
  config: S3AttachmentConfig;
  allowedOrigin: string;
  deniedOrigin: string;
};

export type S3CompatibilityProbeDependencies = {
  createPrimitives(config: S3AttachmentConfig): ProbePrimitives;
  fetch(input: string | URL, init?: RequestInit): Promise<Response>;
  now(): number;
  sleep(milliseconds: number): Promise<void>;
};

const defaultDependencies: S3CompatibilityProbeDependencies = {
  createPrimitives: (config) => new S3AttachmentPrimitives(config),
  fetch: (input, init) => globalThis.fetch(input, init),
  now: () => Date.now(),
  sleep: (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
};

export async function runReportedCompatibilityCases(
  runCase: CaseRunner,
  report: Reporter = console.log,
): Promise<boolean> {
  let passed = true;
  for (const name of S3_COMPATIBILITY_CASES) {
    let result: boolean;
    try {
      result = await runCase(name);
    } catch {
      result = false;
    }
    report(`${result ? "PASS" : "FAIL"} ${name}`);
    passed &&= result;
  }
  return passed;
}

function ok(response: Response): boolean {
  return response.status >= 200 && response.status < 300;
}

function headerTokens(response: Response, name: string): string[] {
  return (response.headers.get(name) ?? "")
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedCorsPreflight(
  response: Response,
  origin: string,
  method: "PUT" | "GET" | "HEAD",
  requiredHeaders: readonly string[] = [],
): boolean {
  if (
    !ok(response) ||
    response.headers.get("access-control-allow-origin") !== origin
  ) {
    return false;
  }
  const methods = headerTokens(response, "access-control-allow-methods");
  const headers = headerTokens(response, "access-control-allow-headers");
  return (
    methods.includes(method.toLowerCase()) &&
    requiredHeaders.every((header) => headers.includes(header.toLowerCase()))
  );
}

export function isDeniedCorsPreflight(
  response: Response,
  deniedOrigin: string,
): boolean {
  if (!ok(response)) return true;
  const allowedOrigin = response.headers.get("access-control-allow-origin");
  return allowedOrigin !== "*" && allowedOrigin !== deniedOrigin;
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "$metadata" in error &&
    (error as { $metadata?: { httpStatusCode?: number } }).$metadata
      ?.httpStatusCode === 404
  );
}

function isAuthFailure(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("$metadata" in error)) {
    return false;
  }
  const status = (error as { $metadata?: { httpStatusCode?: number } })
    .$metadata?.httpStatusCode;
  return status === 401 || status === 403;
}

function withoutChecksumHeader(
  headers: Readonly<Record<string, string>>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(
      ([name]) => name.toLowerCase() !== "x-amz-checksum-sha256",
    ),
  );
}

function unsignedUrl(signedUrl: string): URL {
  const url = new URL(signedUrl);
  url.search = "";
  url.hash = "";
  return url;
}

function preflight(
  dependencies: Pick<S3CompatibilityProbeDependencies, "fetch">,
  url: string,
  origin: string,
  method: "PUT" | "GET" | "HEAD",
  requestedHeaders: readonly string[] = [],
): Promise<Response> {
  return dependencies.fetch(url, {
    method: "OPTIONS",
    headers: {
      origin,
      "access-control-request-method": method,
      ...(requestedHeaders.length > 0
        ? { "access-control-request-headers": requestedHeaders.join(",") }
        : {}),
    },
  });
}

export async function runS3CompatibilityProbe(
  options: S3CompatibilityProbeOptions,
  dependencies: S3CompatibilityProbeDependencies = defaultDependencies,
  report: Reporter = console.log,
): Promise<boolean> {
  const bytes = new TextEncoder().encode(
    `attachment-s3-probe-${dependencies.now()}`,
  );
  const wrongBytes = new TextEncoder().encode("attachment-s3-probe-wrong");
  const hash = createHash("sha256").update(bytes).digest("hex");
  const missingHash = createHash("sha256")
    .update(`${hash}-missing`)
    .digest("hex");
  const primitives = dependencies.createPrimitives(options.config);
  const upload = await primitives.createUploadTarget(
    hash,
    "application/octet-stream",
  );
  const download = await primitives.createDownloadTarget(hash);
  const expiredUpload = await primitives.createUploadTarget(
    hash,
    "application/octet-stream",
    1,
  );
  const expiredDownload = await primitives.createDownloadTarget(hash, 1);

  const wrongConfig = {
    ...options.config,
    accessKeyId: `${options.config.accessKeyId}-invalid`,
    secretAccessKey: "invalid-secret-for-compatibility-probe",
  };
  const wrongPrimitives = dependencies.createPrimitives(wrongConfig);
  const wrongCredentialUpload = await wrongPrimitives.createUploadTarget(
    hash,
    "application/octet-stream",
  );

  return runReportedCompatibilityCases(async (name) => {
    switch (name) {
      case "correct bytes":
        return ok(
          await dependencies.fetch(upload.url, {
            method: "PUT",
            headers: upload.headers,
            body: bytes,
          }),
        );
      case "wrong bytes":
        return !ok(
          await dependencies.fetch(upload.url, {
            method: "PUT",
            headers: upload.headers,
            body: wrongBytes,
          }),
        );
      case "omitted checksum header":
        return !ok(
          await dependencies.fetch(upload.url, {
            method: "PUT",
            headers: withoutChecksumHeader(upload.headers),
            body: bytes,
          }),
        );
      case "changed checksum header":
        return !ok(
          await dependencies.fetch(upload.url, {
            method: "PUT",
            headers: {
              ...upload.headers,
              "x-amz-checksum-sha256":
                "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
            },
            body: bytes,
          }),
        );
      case "HEAD found":
        await primitives.headObject(hash);
        return true;
      case "HEAD not-found":
        try {
          await primitives.headObject(missingHash);
          return false;
        } catch (error) {
          return isNotFound(error);
        }
      case "HEAD auth failure":
        try {
          await wrongPrimitives.headObject(hash);
          return false;
        } catch (error) {
          return isAuthFailure(error);
        }
      case "pre-expiry GET+rehash": {
        const response = await dependencies.fetch(download.url, {
          method: "GET",
          headers: download.headers,
        });
        const digest = createHash("sha256")
          .update(new Uint8Array(await response.arrayBuffer()))
          .digest("hex");
        return ok(response) && digest === hash;
      }
      case "expired URLs":
        await dependencies.sleep(1_100);
        return (
          !ok(
            await dependencies.fetch(expiredUpload.url, {
              method: "PUT",
              headers: expiredUpload.headers,
              body: bytes,
            }),
          ) &&
          !ok(
            await dependencies.fetch(expiredDownload.url, {
              method: "GET",
              headers: expiredDownload.headers,
            }),
          )
        );
      case "unsigned GET":
        return !ok(
          await dependencies.fetch(unsignedUrl(download.url), {
            method: "GET",
          }),
        );
      case "wrong credentials":
        return !ok(
          await dependencies.fetch(wrongCredentialUpload.url, {
            method: "PUT",
            headers: wrongCredentialUpload.headers,
            body: bytes,
          }),
        );
      case "allowed Origin preflight": {
        const requiredPutHeaders = [
          "content-type",
          "x-amz-checksum-sha256",
        ] as const;
        const putResponse = await preflight(
          dependencies,
          upload.url,
          options.allowedOrigin,
          "PUT",
          requiredPutHeaders,
        );
        const getResponse = await preflight(
          dependencies,
          download.url,
          options.allowedOrigin,
          "GET",
        );
        const headResponse = await preflight(
          dependencies,
          download.url,
          options.allowedOrigin,
          "HEAD",
        );
        return (
          isAllowedCorsPreflight(
            putResponse,
            options.allowedOrigin,
            "PUT",
            requiredPutHeaders,
          ) &&
          isAllowedCorsPreflight(getResponse, options.allowedOrigin, "GET") &&
          isAllowedCorsPreflight(headResponse, options.allowedOrigin, "HEAD")
        );
      }
      case "denied Origin preflight": {
        const response = await preflight(
          dependencies,
          upload.url,
          options.deniedOrigin,
          "PUT",
          ["content-type", "x-amz-checksum-sha256"],
        );
        return isDeniedCorsPreflight(response, options.deniedOrigin);
      }
    }
  }, report);
}

async function main(): Promise<void> {
  const storage = parseAttachmentStorageConfig(process.env);
  if (storage.kind !== "s3") {
    console.log("FAIL configuration");
    process.exitCode = 1;
    return;
  }
  const allowedOrigin = process.env.PH_ATTACHMENT_S3_PROBE_ALLOWED_ORIGIN;
  const deniedOrigin = process.env.PH_ATTACHMENT_S3_PROBE_DENIED_ORIGIN;
  if (!allowedOrigin || !deniedOrigin) {
    console.log("FAIL probe origins");
    process.exitCode = 1;
    return;
  }
  const result = await runS3CompatibilityProbe({
    config: storage.s3,
    allowedOrigin,
    deniedOrigin,
  });
  if (!result) process.exitCode = 1;
}

if (
  process.argv[1] &&
  import.meta.url === new URL(process.argv[1], "file:").href
) {
  void main().catch(() => {
    console.log("FAIL probe execution");
    process.exitCode = 1;
  });
}
