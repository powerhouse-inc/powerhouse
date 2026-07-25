import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  MAX_S3_PRESIGN_TTL_SECONDS,
  deriveS3AttachmentKey,
  parseAttachmentStorageConfig,
  sha256HexToBase64,
} from "../../../src/storage/s3/index.js";

const secret = "never-print-this-secret";
const baseEnv = {
  PH_ATTACHMENT_STORAGE: "s3",
  PH_ATTACHMENT_S3_ENDPOINT: "https://fsn1.your-objectstorage.com",
  PH_ATTACHMENT_S3_REGION: "fsn1",
  PH_ATTACHMENT_S3_BUCKET: "bucket",
  PH_ATTACHMENT_S3_ACCESS_KEY_ID: "access-key",
  PH_ATTACHMENT_S3_SECRET_ACCESS_KEY: secret,
};

describe("S3 attachment configuration", () => {
  it("defaults absent/filesystem selectors without parsing S3 values", () => {
    expect(parseAttachmentStorageConfig({})).toEqual({ kind: "filesystem" });
    expect(
      parseAttachmentStorageConfig({ PH_ATTACHMENT_STORAGE: "filesystem" }),
    ).toEqual({ kind: "filesystem" });
  });

  it("parses normalized defaults and explicit options", () => {
    expect(parseAttachmentStorageConfig(baseEnv)).toEqual({
      kind: "s3",
      s3: {
        endpoint: "https://fsn1.your-objectstorage.com",
        region: "fsn1",
        bucket: "bucket",
        accessKeyId: "access-key",
        secretAccessKey: secret,
        prefix: "attachments",
        forcePathStyle: false,
        uploadTtlSeconds: 900,
        downloadTtlSeconds: 300,
      },
    });
    const parsed = parseAttachmentStorageConfig({
      ...baseEnv,
      S3_ATTACHMENT_PREFIX: "tenant/attachments/",
      PH_ATTACHMENT_S3_FORCE_PATH_STYLE: "true",
      PH_ATTACHMENT_S3_UPLOAD_TTL_SECONDS: "1",
      PH_ATTACHMENT_S3_DOWNLOAD_TTL_SECONDS: String(MAX_S3_PRESIGN_TTL_SECONDS),
    });
    expect(parsed.kind === "s3" && parsed.s3).toMatchObject({
      prefix: "tenant/attachments",
      forcePathStyle: true,
      uploadTtlSeconds: 1,
      downloadTtlSeconds: MAX_S3_PRESIGN_TTL_SECONDS,
    });
  });

  it("allows plain HTTP endpoints only for loopback hosts (local emulators)", () => {
    for (const endpoint of [
      "http://127.0.0.1:8333",
      "http://localhost:8333",
      "http://[::1]:8333",
    ]) {
      const parsed = parseAttachmentStorageConfig({
        ...baseEnv,
        PH_ATTACHMENT_S3_ENDPOINT: endpoint,
      });
      expect(parsed.kind === "s3" && parsed.s3.endpoint).toBe(endpoint);
    }
    expect(() =>
      parseAttachmentStorageConfig({
        ...baseEnv,
        PH_ATTACHMENT_S3_ENDPOINT: "http://bucket.example.com",
      }),
    ).toThrow(/PH_ATTACHMENT_S3_ENDPOINT/);
    expect(() =>
      parseAttachmentStorageConfig({
        ...baseEnv,
        PH_ATTACHMENT_S3_ENDPOINT: "http://127.0.0.1.example.com:8333",
      }),
    ).toThrow(/PH_ATTACHMENT_S3_ENDPOINT/);
  });

  it.each([
    [{ PH_ATTACHMENT_STORAGE: "other" }, "PH_ATTACHMENT_STORAGE"],
    [
      { ...baseEnv, PH_ATTACHMENT_S3_ENDPOINT: "http://example.com" },
      "PH_ATTACHMENT_S3_ENDPOINT",
    ],
    [
      {
        ...baseEnv,
        PH_ATTACHMENT_S3_ENDPOINT: "https://user:pass@example.com",
      },
      "PH_ATTACHMENT_S3_ENDPOINT",
    ],
    [{ ...baseEnv, PH_ATTACHMENT_S3_REGION: " " }, "PH_ATTACHMENT_S3_REGION"],
    [
      { ...baseEnv, PH_ATTACHMENT_S3_REGION: " fsn1" },
      "PH_ATTACHMENT_S3_REGION",
    ],
    [{ ...baseEnv, PH_ATTACHMENT_S3_BUCKET: "" }, "PH_ATTACHMENT_S3_BUCKET"],
    [
      { ...baseEnv, PH_ATTACHMENT_S3_ACCESS_KEY_ID: undefined },
      "PH_ATTACHMENT_S3_ACCESS_KEY_ID",
    ],
    [
      { ...baseEnv, PH_ATTACHMENT_S3_SECRET_ACCESS_KEY: undefined },
      "PH_ATTACHMENT_S3_SECRET_ACCESS_KEY",
    ],
    [
      { ...baseEnv, S3_ATTACHMENT_PREFIX: "/attachments" },
      "S3_ATTACHMENT_PREFIX",
    ],
    [
      { ...baseEnv, S3_ATTACHMENT_PREFIX: "attachments//bad" },
      "S3_ATTACHMENT_PREFIX",
    ],
    [
      { ...baseEnv, S3_ATTACHMENT_PREFIX: "attachments/../bad" },
      "S3_ATTACHMENT_PREFIX",
    ],
    [
      { ...baseEnv, S3_ATTACHMENT_PREFIX: "attachments\\bad" },
      "S3_ATTACHMENT_PREFIX",
    ],
    [
      { ...baseEnv, PH_ATTACHMENT_S3_FORCE_PATH_STYLE: "1" },
      "PH_ATTACHMENT_S3_FORCE_PATH_STYLE",
    ],
    [
      { ...baseEnv, PH_ATTACHMENT_S3_UPLOAD_TTL_SECONDS: "0" },
      "PH_ATTACHMENT_S3_UPLOAD_TTL_SECONDS",
    ],
    [
      { ...baseEnv, PH_ATTACHMENT_S3_DOWNLOAD_TTL_SECONDS: "1.5" },
      "PH_ATTACHMENT_S3_DOWNLOAD_TTL_SECONDS",
    ],
    [
      {
        ...baseEnv,
        PH_ATTACHMENT_S3_DOWNLOAD_TTL_SECONDS: String(
          MAX_S3_PRESIGN_TTL_SECONDS + 1,
        ),
      },
      "PH_ATTACHMENT_S3_DOWNLOAD_TTL_SECONDS",
    ],
  ] as const)(
    "rejects invalid input without leaking secrets",
    (env, variable) => {
      try {
        parseAttachmentStorageConfig(env);
        throw new Error("expected parsing to fail");
      } catch (error) {
        expect(String(error)).toContain(variable);
        expect(String(error)).not.toContain(secret);
      }
    },
  );
});

describe("S3 attachment key and checksum", () => {
  const hash = "4e87" + "ab".repeat(30);

  it("derives the frozen fan-out key", () => {
    expect(deriveS3AttachmentKey(hash, "attachments")).toBe(
      `attachments/4e/87/${hash}`,
    );
  });

  it.each([hash.toUpperCase(), "a".repeat(63), "g".repeat(64)])(
    "rejects unsafe hashes",
    (value) => {
      expect(() => deriveS3AttachmentKey(value, "attachments")).toThrow(
        "64 lowercase",
      );
      expect(() => sha256HexToBase64(value)).toThrow("64 lowercase");
    },
  );

  it.each(["", "/attachments", "attachments/", "a//b", "a/../b", "a\\b"])(
    "rejects unnormalized key prefixes",
    (prefix) => {
      expect(() => deriveS3AttachmentKey(hash, prefix)).toThrow(
        "normalized and safe",
      );
    },
  );

  it("encodes raw digest bytes rather than hexadecimal text", () => {
    const vector = createHash("sha256").update("abc").digest("hex");
    expect(sha256HexToBase64(vector)).toBe(
      "ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=",
    );
    expect(sha256HexToBase64(vector)).toBe(
      Buffer.from(vector, "hex").toString("base64"),
    );
  });
});
