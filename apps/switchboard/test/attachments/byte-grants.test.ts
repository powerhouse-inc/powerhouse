import type { AttachmentHash } from "@powerhousedao/reactor";
import type { AttachmentBuildResult } from "@powerhousedao/reactor-attachments";
import type {
  AttachmentAccessResult,
  IAttachmentAccessService,
} from "@powerhousedao/reactor-api";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import type { AttachmentActorContext } from "../../src/attachments/auth.js";
import {
  makeDownloadHandler,
  makeStatHandler,
} from "../../src/attachments/routes.js";
import { AttachmentUrlSigner } from "../../src/attachments/url-signer.js";

const HASH = "c".repeat(64) as AttachmentHash;
const REF = `attachment://v1:${HASH}`;
const NOW_MS = Date.parse("2026-09-24T00:00:00.000Z");
const SIGNER = new AttachmentUrlSigner("s".repeat(32), () => NOW_MS);

const ACTOR: AttachmentActorContext = {
  user: {
    address: "0xreader",
    chainId: 1,
    networkId: "mainnet",
    appKey: "did:key:zApp",
  },
  authEnabled: true,
};

const HEADER = {
  hash: HASH,
  status: "available",
  mimeType: "text/plain",
  fileName: "a.txt",
  sizeBytes: 0,
  extension: "txt",
  createdAtUtc: "2026-09-01T00:00:00.000Z",
  lastAccessedAtUtc: "2026-09-01T00:00:00.000Z",
  expiresAtUtc: null,
};

function makeReq(query: string): IncomingMessage {
  return {
    method: "GET",
    url: `/attachments/${HASH}${query}`,
    headers: {},
    params: { hash: HASH },
    once: () => undefined,
  } as unknown as IncomingMessage;
}

function makeRes() {
  const headers: Record<string, string> = {};
  const chunks: Buffer[] = [];
  const res = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    },
  });
  Object.assign(res, {
    statusCode: 200,
    setHeader(name: string, value: string | number | readonly string[]) {
      headers[name.toLowerCase()] = String(value);
    },
  });
  Object.defineProperty(res, "_headers", { get: () => headers });
  Object.defineProperty(res, "_body", {
    get: () => Buffer.concat(chunks).toString("utf8"),
  });
  return res as unknown as ServerResponse & {
    readonly _headers: Record<string, string>;
    readonly _body: string;
  };
}

function makeAttachments() {
  const stat = vi.fn().mockResolvedValue(HEADER);
  const get = vi.fn().mockResolvedValue({
    header: HEADER,
    body: new ReadableStream<Uint8Array>({ start: (c) => c.close() }),
  });
  return {
    attachments: { store: { stat, get } } as unknown as AttachmentBuildResult,
    stat,
    get,
  };
}

function makeAccess(result: AttachmentAccessResult | Error) {
  const canReadAttachment = vi.fn(() =>
    result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
  );
  return {
    access: { canReadAttachment } as IAttachmentAccessService,
    canReadAttachment,
  };
}

const ALLOWED: AttachmentAccessResult = {
  kind: "allowed",
  documentId: "canonical-doc" as never,
  ref: REF as never,
};

function signedQuery(documentId = "doc-1", ttl = 300): string {
  return `?${SIGNER.sign(HASH, documentId, ttl).query}`;
}

describe.each([
  ["HEAD", makeStatHandler, "stat"],
  ["GET", makeDownloadHandler, "get"],
] as const)("%s /attachments/:hash grants", (_, makeHandler, storeCall) => {
  async function run(
    query: string,
    access: IAttachmentAccessService,
    actor: AttachmentActorContext | undefined = ACTOR,
    signer: AttachmentUrlSigner | null = SIGNER,
  ) {
    const store = makeAttachments();
    const res = makeRes();
    await makeHandler(store.attachments, access, signer)(
      makeReq(query),
      res,
      undefined,
      actor,
    );
    return { res, store: store[storeCall] };
  }

  it("refuses a hash-only request with 404 without consulting access or storage", async () => {
    const { access, canReadAttachment } = makeAccess(ALLOWED);
    const { res, store } = await run("", access);

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res._body)).toEqual({ error: "Attachment not found" });
    expect(canReadAttachment).not.toHaveBeenCalled();
    expect(store).not.toHaveBeenCalled();
  });

  it.each([
    ["duplicated", "?documentId=a&documentId=b"],
    ["blank", "?documentId=%20"],
  ])("refuses a %s documentId with 404", async (_, query) => {
    const { access, canReadAttachment } = makeAccess(ALLOWED);
    const { res } = await run(query, access);

    expect(res.statusCode).toBe(404);
    expect(canReadAttachment).not.toHaveBeenCalled();
  });

  it("authorizes a documentId through the access service as the caller", async () => {
    const { access, canReadAttachment } = makeAccess(ALLOWED);
    const { res, store } = await run("?documentId=doc-1", access);

    expect(res.statusCode).toBe(200);
    expect(res._headers["cache-control"]).toBe("private");
    expect(canReadAttachment).toHaveBeenCalledWith({
      documentId: "doc-1",
      attachmentRef: REF,
      userAddress: "0xreader",
      appKey: "did:key:zApp",
    });
    expect(store).toHaveBeenCalledOnce();
  });

  it("passes the anonymous caller as an empty subject", async () => {
    const { access, canReadAttachment } = makeAccess(ALLOWED);
    await run("?documentId=doc-1", access, {
      user: undefined,
      authEnabled: true,
    });

    expect(canReadAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ userAddress: undefined, appKey: undefined }),
    );
  });

  it("answers a denied decision with the same 404 as an unknown hash", async () => {
    const { access } = makeAccess({ kind: "denied" });
    const { res, store } = await run("?documentId=doc-1", access);

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res._body)).toEqual({ error: "Attachment not found" });
    expect(store).not.toHaveBeenCalled();
  });

  it("answers projection-unavailable with 503", async () => {
    const { access } = makeAccess({ kind: "projection-unavailable" });
    const { res, store } = await run("?documentId=doc-1", access);

    expect(res.statusCode).toBe(503);
    expect(store).not.toHaveBeenCalled();
  });

  it("answers an access failure with an opaque 500", async () => {
    const { access } = makeAccess(new Error("db down"));
    const { res, store } = await run("?documentId=doc-1", access);

    expect(res.statusCode).toBe(500);
    expect(res._body).not.toContain("db down");
    expect(store).not.toHaveBeenCalled();
  });

  it("serves a valid signed URL without re-running the gate, even anonymously", async () => {
    const { access, canReadAttachment } = makeAccess({ kind: "denied" });
    const { res, store } = await run(signedQuery(), access, {
      user: undefined,
      authEnabled: true,
    });

    expect(res.statusCode).toBe(200);
    expect(canReadAttachment).not.toHaveBeenCalled();
    expect(store).toHaveBeenCalledOnce();
  });

  it.each([
    [
      "tampered documentId",
      () => signedQuery().replace("documentId=doc-1", "documentId=doc-2"),
    ],
    [
      "tampered signature",
      () =>
        signedQuery().replace(
          /signature=(.)/,
          (_, c: string) => `signature=${c === "A" ? "B" : "A"}`,
        ),
    ],
    [
      "extended expiry",
      () => signedQuery().replace(/expires=\d+/, "expires=9999999999"),
    ],
    ["missing signature", () => signedQuery().replace(/&signature=[^&]+/, "")],
    ["missing expiry", () => signedQuery().replace(/&expires=\d+/, "")],
  ])(
    "refuses a %s with 404 and never falls back to the gate",
    async (_, query) => {
      const { access, canReadAttachment } = makeAccess(ALLOWED);
      const { res, store } = await run(query(), access);

      expect(res.statusCode).toBe(404);
      expect(canReadAttachment).not.toHaveBeenCalled();
      expect(store).not.toHaveBeenCalled();
    },
  );

  it("refuses an expired signed URL with 404", async () => {
    const { access } = makeAccess(ALLOWED);
    const expired = new AttachmentUrlSigner(
      "s".repeat(32),
      () => NOW_MS + 301_000,
    );
    const { res } = await run(signedQuery(), access, ACTOR, expired);

    expect(res.statusCode).toBe(404);
  });

  it("refuses a signed URL when this server has no signer", async () => {
    const { access } = makeAccess(ALLOWED);
    const { res } = await run(signedQuery(), access, ACTOR, null);

    expect(res.statusCode).toBe(404);
  });
});

describe("GET /attachments/:hash re-fetch anchor", () => {
  it("passes the granted canonical documentId to the store", async () => {
    const { attachments, get } = makeAttachments();
    const { access } = makeAccess(ALLOWED);

    await makeDownloadHandler(attachments, access, SIGNER)(
      makeReq("?documentId=doc-1"),
      makeRes(),
      undefined,
      ACTOR,
    );

    expect(get).toHaveBeenCalledWith(
      HASH,
      expect.any(AbortSignal),
      "canonical-doc",
    );
  });
});
