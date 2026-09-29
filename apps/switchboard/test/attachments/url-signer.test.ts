import type { AttachmentHash } from "@powerhousedao/reactor";
import { describe, expect, it } from "vitest";
import {
  ATTACHMENT_URL_SIGNING_SECRET_ENV,
  AttachmentUrlSigner,
  resolveAttachmentUrlSigning,
} from "../../src/attachments/url-signer.js";

const HASH = "a".repeat(64) as AttachmentHash;
const OTHER_HASH = "b".repeat(64) as AttachmentHash;
const SECRET = "k".repeat(32);

function signed(now: number, ttl = 300) {
  const signer = new AttachmentUrlSigner(SECRET, () => now);
  const { query, expiresAtUtc } = signer.sign(HASH, "doc-1", ttl);
  const params = new URLSearchParams(query);
  return {
    signer,
    expiresAtUtc,
    documentId: params.get("documentId")!,
    expires: params.get("expires")!,
    signature: params.get("signature")!,
  };
}

describe("AttachmentUrlSigner", () => {
  const NOW = Date.parse("2026-09-24T00:00:00.000Z");

  it("verifies what it signed until the expiry", () => {
    const { signer, expiresAtUtc, documentId, expires, signature } =
      signed(NOW);

    expect(documentId).toBe("doc-1");
    expect(expiresAtUtc).toBe(new Date(NOW + 300_000).toISOString());
    expect(signer.verify(HASH, documentId, expires, signature)).toBe(true);
  });

  it("refuses at and after the expiry", () => {
    const { expires, signature } = signed(NOW);
    const at = new AttachmentUrlSigner(SECRET, () => NOW + 300_000);

    expect(at.verify(HASH, "doc-1", expires, signature)).toBe(false);
  });

  it("refuses a different hash, document, expiry or secret", () => {
    const { signer, expires, signature } = signed(NOW);

    expect(signer.verify(OTHER_HASH, "doc-1", expires, signature)).toBe(false);
    expect(signer.verify(HASH, "doc-2", expires, signature)).toBe(false);
    expect(
      signer.verify(HASH, "doc-1", String(Number(expires) + 1), signature),
    ).toBe(false);
    expect(
      new AttachmentUrlSigner("x".repeat(32), () => NOW).verify(
        HASH,
        "doc-1",
        expires,
        signature,
      ),
    ).toBe(false);
  });

  it("refuses malformed expiry and signature values", () => {
    const { signer, expires, signature } = signed(NOW);

    expect(signer.verify(HASH, "doc-1", `${expires}.0`, signature)).toBe(false);
    expect(signer.verify(HASH, "doc-1", expires, `${signature}=`)).toBe(false);
    expect(signer.verify(HASH, "doc-1", expires, "")).toBe(false);
  });
});

describe("resolveAttachmentUrlSigning", () => {
  it("uses a configured secret", () => {
    const signing = resolveAttachmentUrlSigning({
      [ATTACHMENT_URL_SIGNING_SECRET_ENV]: SECRET,
      NODE_ENV: "production",
    });
    expect(signing.status).toBe("configured");
  });

  it("fails closed in production when unset", () => {
    expect(resolveAttachmentUrlSigning({ NODE_ENV: "production" })).toEqual({
      status: "unconfigured",
    });
  });

  it.each([undefined, "development", "test"])(
    "uses a per-process secret when unset and NODE_ENV is %s",
    (nodeEnv) => {
      const signing = resolveAttachmentUrlSigning({ NODE_ENV: nodeEnv });
      expect(signing.status).toBe("ephemeral");
    },
  );

  it.each(["short", ` ${"k".repeat(32)}`, ""])(
    "refuses to boot on an unusable secret %j",
    (secret) => {
      expect(() =>
        resolveAttachmentUrlSigning({
          [ATTACHMENT_URL_SIGNING_SECRET_ENV]: secret,
        }),
      ).toThrow(ATTACHMENT_URL_SIGNING_SECRET_ENV);
    },
  );
});
