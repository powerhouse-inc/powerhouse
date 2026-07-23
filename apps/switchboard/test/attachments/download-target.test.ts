import type { AttachmentHash } from "@powerhousedao/reactor";
import type {
  AttachmentBuildResult,
  IAttachmentBackend,
} from "@powerhousedao/reactor-attachments";
import type {
  API,
  AttachmentAccessResult,
  IAttachmentAccessService,
} from "@powerhousedao/reactor-api";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import type { AttachmentActorContext } from "../../src/attachments/auth.js";
import { registerAttachmentRoutes } from "../../src/attachments/index.js";
import { makeDownloadTargetHandler } from "../../src/attachments/routes.js";

const HASH = "a".repeat(64) as AttachmentHash;
const REF = `attachment://v1:${HASH}`;
const DOC_ID = "doc-1";
const EXPIRES = "2026-07-23T00:00:00.000Z";

const ACTOR: AttachmentActorContext = {
  user: { address: "0xverified", chainId: 1, networkId: "mainnet" },
  authEnabled: true,
};

const AVAILABLE_HEADER = {
  status: "available",
  mimeType: "application/pdf",
  fileName: "f.pdf",
  sizeBytes: 3,
  extension: "pdf",
  createdAtUtc: EXPIRES,
  lastAccessedAtUtc: EXPIRES,
};

function makeReq(opts: {
  hash?: string;
  url?: string;
  headers?: Record<string, string>;
}): IncomingMessage {
  return {
    method: "GET",
    url:
      opts.url ??
      `/attachments/${opts.hash ?? HASH}/download-target?documentId=${DOC_ID}`,
    headers: { host: "sb.example.com", ...(opts.headers ?? {}) },
    socket: {},
    params: { hash: opts.hash ?? HASH },
  } as unknown as IncomingMessage;
}

function makeRes() {
  const headers: Record<string, string> = {};
  let body = "";
  const res = {
    statusCode: 200,
    setHeader(name: string, value: string | number | readonly string[]) {
      headers[name.toLowerCase()] = String(value);
    },
    end(chunk?: string | Buffer) {
      if (chunk !== undefined) {
        body += typeof chunk === "string" ? chunk : chunk.toString("utf8");
      }
    },
  } as unknown as ServerResponse;
  Object.defineProperty(res, "_headers", { get: () => headers });
  Object.defineProperty(res, "_body", { get: () => body });
  return res as ServerResponse & {
    readonly _headers: Record<string, string>;
    readonly _body: string;
  };
}

function makeAccess(result: AttachmentAccessResult): {
  access: IAttachmentAccessService;
  spy: ReturnType<typeof vi.fn>;
} {
  const spy = vi.fn().mockResolvedValue(result);
  return {
    access: {
      canReadAttachment: spy,
      canAttachToDocument: vi.fn().mockResolvedValue({ kind: "denied" }),
    },
    spy,
  };
}

function makeAttachments(opts: {
  backend?: Partial<IAttachmentBackend> & { kind: "filesystem" | "s3" };
  stat?: () => Promise<unknown>;
}): AttachmentBuildResult & { statSpy: ReturnType<typeof vi.fn> } {
  const statSpy = vi.fn(opts.stat ?? (() => Promise.resolve(AVAILABLE_HEADER)));
  return {
    store: { stat: statSpy },
    ...(opts.backend ? { backend: opts.backend } : {}),
    statSpy,
  } as unknown as AttachmentBuildResult & {
    statSpy: ReturnType<typeof vi.fn>;
  };
}

const ALLOWED: AttachmentAccessResult = {
  kind: "allowed",
  documentId: DOC_ID as never,
  ref: REF as never,
};

describe("makeDownloadTargetHandler", () => {
  it("returns a switchboard target for filesystem with no-store", async () => {
    const { access, spy } = makeAccess(ALLOWED);
    const attachments = makeAttachments({});
    const handler = makeDownloadTargetHandler(attachments, access);
    const res = makeRes();

    await handler(makeReq({}), res, undefined, ACTOR);

    expect(res.statusCode).toBe(200);
    expect(res._headers["cache-control"]).toBe("no-store");
    expect(JSON.parse(res._body)).toEqual({
      kind: "switchboard",
      method: "GET",
      url: `http://sb.example.com/attachments/${HASH}`,
      headers: {},
    });
    expect(spy).toHaveBeenCalledWith({
      documentId: DOC_ID,
      attachmentRef: REF,
      userAddress: "0xverified",
    });
  });

  it("returns the backend presigned-get target in S3 mode", async () => {
    const { access } = makeAccess(ALLOWED);
    const prepareDownloadTarget = vi.fn().mockResolvedValue({
      kind: "presigned-get",
      method: "GET",
      url: "https://bucket.example.com/attachments/aa?sig=1",
      headers: {},
      expiresAtUtc: EXPIRES,
    });
    const attachments = makeAttachments({
      backend: { kind: "s3", prepareDownloadTarget } as never,
    });
    const handler = makeDownloadTargetHandler(attachments, access);
    const res = makeRes();

    await handler(makeReq({}), res, undefined, ACTOR);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res._body)).toMatchObject({ kind: "presigned-get" });
    expect(prepareDownloadTarget).toHaveBeenCalledWith(HASH);
  });

  it("normalizes an uppercase path hash before authorization and lookup", async () => {
    const { access, spy } = makeAccess(ALLOWED);
    const attachments = makeAttachments({});
    const handler = makeDownloadTargetHandler(attachments, access);
    const res = makeRes();

    await handler(makeReq({ hash: HASH.toUpperCase() }), res, undefined, ACTOR);

    expect(res.statusCode).toBe(200);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ attachmentRef: REF }),
    );
    expect(attachments.statSpy).toHaveBeenCalledWith(HASH);
  });

  it("rejects an invalid hash before any access or storage call", async () => {
    const { access, spy } = makeAccess(ALLOWED);
    const attachments = makeAttachments({});
    const handler = makeDownloadTargetHandler(attachments, access);
    const res = makeRes();

    await handler(makeReq({ hash: "nothex" }), res, undefined, ACTOR);

    expect(res.statusCode).toBe(400);
    expect(spy).not.toHaveBeenCalled();
    expect(attachments.statSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", `/attachments/${HASH}/download-target`],
    [
      "duplicated",
      `/attachments/${HASH}/download-target?documentId=a&documentId=b`,
    ],
    ["blank", `/attachments/${HASH}/download-target?documentId=%20%20`],
    [
      "oversized",
      `/attachments/${HASH}/download-target?documentId=${"x".repeat(600)}`,
    ],
  ])("rejects a %s documentId before authorization", async (_, url) => {
    const { access, spy } = makeAccess(ALLOWED);
    const attachments = makeAttachments({});
    const handler = makeDownloadTargetHandler(attachments, access);
    const res = makeRes();

    await handler(makeReq({ url }), res, undefined, ACTOR);

    expect(res.statusCode).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  it("maps a denied decision to the generic 404 with zero storage calls", async () => {
    const { access } = makeAccess({ kind: "denied" });
    const prepareDownloadTarget = vi.fn();
    const attachments = makeAttachments({
      backend: { kind: "s3", prepareDownloadTarget } as never,
    });
    const handler = makeDownloadTargetHandler(attachments, access);
    const res = makeRes();

    await handler(makeReq({}), res, undefined, ACTOR);

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res._body)).toEqual({ error: "Attachment not found" });
    expect(attachments.statSpy).not.toHaveBeenCalled();
    expect(prepareDownloadTarget).not.toHaveBeenCalled();
  });

  it("maps projection-unavailable to a generic non-cacheable 503 before storage", async () => {
    const { access } = makeAccess({ kind: "projection-unavailable" });
    const attachments = makeAttachments({});
    const handler = makeDownloadTargetHandler(attachments, access);
    const res = makeRes();

    await handler(makeReq({}), res, undefined, ACTOR);

    expect(res.statusCode).toBe(503);
    expect(res._headers["cache-control"]).toBe("no-store");
    expect(attachments.statSpy).not.toHaveBeenCalled();
  });

  it("maps an unknown attachment after authorization to the same generic 404", async () => {
    const { access } = makeAccess(ALLOWED);
    const attachments = makeAttachments({});
    const { AttachmentNotFound } =
      await import("@powerhousedao/reactor-attachments");
    attachments.statSpy.mockRejectedValue(new AttachmentNotFound(HASH));
    const handler = makeDownloadTargetHandler(attachments, access);
    const res = makeRes();

    await handler(makeReq({}), res, undefined, ACTOR);

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res._body)).toEqual({ error: "Attachment not found" });
  });

  it("maps a pending attachment to the generic 404", async () => {
    const { access } = makeAccess(ALLOWED);
    const attachments = makeAttachments({
      stat: () => Promise.resolve({ ...AVAILABLE_HEADER, status: "pending" }),
    });
    const handler = makeDownloadTargetHandler(attachments, access);
    const res = makeRes();

    await handler(makeReq({}), res, undefined, ACTOR);

    expect(res.statusCode).toBe(404);
  });

  it("maps presigner failure to a sanitized 502 without URL detail", async () => {
    const { access } = makeAccess(ALLOWED);
    const prepareDownloadTarget = vi
      .fn()
      .mockRejectedValue(
        new Error(
          "https://bucket.internal/attachments/aa?X-Amz-Signature=s3cr3t",
        ),
      );
    const attachments = makeAttachments({
      backend: { kind: "s3", prepareDownloadTarget } as never,
    });
    const handler = makeDownloadTargetHandler(attachments, access);
    const res = makeRes();

    await handler(makeReq({}), res, undefined, ACTOR);

    expect(res.statusCode).toBe(502);
    expect(res._body).not.toContain("X-Amz-Signature");
    expect(res._body).not.toContain("bucket.internal");
  });

  it("passes an anonymous actor as an undefined address (OPEN mode)", async () => {
    const { access, spy } = makeAccess(ALLOWED);
    const attachments = makeAttachments({});
    const handler = makeDownloadTargetHandler(attachments, access);
    const res = makeRes();

    await handler(makeReq({}), res, undefined, {
      user: undefined,
      authEnabled: false,
    });

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ userAddress: undefined }),
    );
  });

  it("honours x-forwarded proto/host when building the switchboard target", async () => {
    const { access } = makeAccess(ALLOWED);
    const attachments = makeAttachments({});
    const handler = makeDownloadTargetHandler(attachments, access);
    const res = makeRes();

    await handler(
      makeReq({
        headers: {
          "x-forwarded-proto": "https",
          "x-forwarded-host": "public.example.com",
        },
      }),
      res,
      undefined,
      ACTOR,
    );

    expect(JSON.parse(res._body)).toMatchObject({
      url: `https://public.example.com/attachments/${HASH}`,
    });
  });
});

describe("registerAttachmentRoutes inventory", () => {
  it("mounts exactly the six legacy routes plus download-target", () => {
    const captured: Array<{ method: string; path: string }> = [];
    const api = {
      httpAdapter: {
        mountNodeRoute: (method: string, path: string) => {
          captured.push({ method, path });
        },
      },
      authService: undefined,
      attachments: {},
      attachmentAccess: { canReadAttachment: vi.fn() },
    } as unknown as API;

    registerAttachmentRoutes(api);

    expect(captured).toEqual([
      { method: "POST", path: "/attachments/reservations" },
      { method: "GET", path: "/attachments/reservations/:reservationId" },
      { method: "DELETE", path: "/attachments/reservations/:reservationId" },
      { method: "PUT", path: "/attachments/reservations/:reservationId" },
      { method: "HEAD", path: "/attachments/:hash" },
      { method: "GET", path: "/attachments/:hash/download-target" },
      { method: "GET", path: "/attachments/:hash" },
    ]);
  });
});
