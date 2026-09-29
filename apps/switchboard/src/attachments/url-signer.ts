import type { AttachmentHash } from "@powerhousedao/reactor";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const ATTACHMENT_URL_SIGNING_SECRET_ENV =
  "PH_ATTACHMENT_URL_SIGNING_SECRET";

const MIN_SECRET_LENGTH = 32;
const EXPIRES_PATTERN = /^[1-9]\d{0,15}$/;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type SignedAttachmentUrl = {
  query: string;
  expiresAtUtc: string;
};

// The filesystem counterpart of an S3 presigned GET.
export class AttachmentUrlSigner {
  constructor(
    private readonly secret: string | Buffer,
    private readonly now: () => number = Date.now,
  ) {}

  sign(
    hash: AttachmentHash,
    documentId: string,
    ttlSeconds: number,
  ): SignedAttachmentUrl {
    const expires = Math.floor(this.now() / 1000) + ttlSeconds;
    const params = new URLSearchParams({
      documentId,
      expires: String(expires),
      signature: this.mac(hash, documentId, String(expires)),
    });
    return {
      query: params.toString(),
      expiresAtUtc: new Date(expires * 1000).toISOString(),
    };
  }

  verify(
    hash: AttachmentHash,
    documentId: string,
    expires: string,
    signature: string,
  ): boolean {
    if (!EXPIRES_PATTERN.test(expires) || !SIGNATURE_PATTERN.test(signature)) {
      return false;
    }
    if (Number(expires) * 1000 <= this.now()) {
      return false;
    }
    const expected = Buffer.from(this.mac(hash, documentId, expires));
    const presented = Buffer.from(signature);
    return (
      expected.length === presented.length &&
      timingSafeEqual(expected, presented)
    );
  }

  private mac(hash: string, documentId: string, expires: string): string {
    return createHmac("sha256", this.secret)
      .update(
        JSON.stringify(["attachment-download/v1", hash, documentId, expires]),
      )
      .digest("base64url");
  }
}

export type AttachmentUrlSigning =
  | { status: "configured"; signer: AttachmentUrlSigner }
  | { status: "ephemeral"; signer: AttachmentUrlSigner }
  | { status: "unconfigured" };

// Unset: production fails closed, anything else gets a per-process secret.
export function resolveAttachmentUrlSigning(
  env: Readonly<Record<string, string | undefined>> = process.env,
): AttachmentUrlSigning {
  const secret = env[ATTACHMENT_URL_SIGNING_SECRET_ENV];
  if (secret !== undefined) {
    if (secret.trim() !== secret || secret.length < MIN_SECRET_LENGTH) {
      throw new Error(
        `${ATTACHMENT_URL_SIGNING_SECRET_ENV} must be at least ${MIN_SECRET_LENGTH} characters with no leading or trailing whitespace`,
      );
    }
    return { status: "configured", signer: new AttachmentUrlSigner(secret) };
  }
  if (env.NODE_ENV === "production") {
    return { status: "unconfigured" };
  }
  return {
    status: "ephemeral",
    signer: new AttachmentUrlSigner(randomBytes(32)),
  };
}
