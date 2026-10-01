import type { AttachmentHash, AttachmentRef } from "@powerhousedao/reactor";
import {
  AttachmentAlreadyExists,
  AttachmentNotFound,
  InvalidAttachmentMetadata,
  type AttachmentHeader,
  type AttachmentResponse,
  type IAttachmentService,
  type ReserveAttachmentOptions,
} from "@powerhousedao/reactor-attachments";
import type { ILogger } from "document-model";
import { describe, expect, it, vi } from "vitest";
import { AuthenticationRequiredError } from "../src/graphql/errors.js";
import type {
  AttachmentAccessResult,
  AttachmentCallerResult,
  IAttachmentAccessService,
} from "../src/services/attachment-access.service.js";
import type { CanonicalDocumentId } from "../src/services/authorization.service.js";
import {
  AttachmentAccessFailed,
  AttachmentAccessUnavailable,
  AttachmentClientProvider,
  AuthorizedAttachmentService,
} from "../src/services/authorized-attachment.service.js";

const HASH = "a".repeat(64) as AttachmentHash;
const CALLER_REF = `attachment://v1:${"A".repeat(64)}` as AttachmentRef;
const CANONICAL_REF = `attachment://v1:${HASH}` as AttachmentRef;
const CALLER_DOC = "my-slug";
const CANONICAL_DOC = "doc-canonical-id" as CanonicalDocumentId;
const SUBJECT = { address: "0xuser", key: "did:key:app" };

const ALLOWED: AttachmentAccessResult = {
  kind: "allowed",
  documentId: CANONICAL_DOC,
  ref: CANONICAL_REF,
};

const HEADER: AttachmentHeader = {
  hash: HASH,
  mimeType: "text/plain",
  fileName: "a.txt",
  sizeBytes: 1,
  extension: "txt",
  status: "available",
  source: "local",
  createdAtUtc: "2026-10-01T00:00:00.000Z",
  lastAccessedAtUtc: "2026-10-01T00:00:00.000Z",
  expiresAtUtc: null,
};

const HASH_FIRST: ReserveAttachmentOptions = {
  mimeType: "text/plain",
  fileName: "a.txt",
  extension: "txt",
  clientHash: HASH,
  sizeBytes: 1,
};

function setup(
  options: {
    decision?: AttachmentAccessResult | Error;
    caller?: AttachmentCallerResult | Error;
    subject?: { address?: string; key?: string };
  } = {},
) {
  const decision = options.decision ?? ALLOWED;
  const caller = options.caller ?? { kind: "admitted" };
  const response: AttachmentResponse = {
    header: HEADER,
    body: new ReadableStream<Uint8Array>(),
  };
  const upload = { reservationId: "r-1", ref: CANONICAL_REF };
  const inner = {
    reserve: vi.fn().mockResolvedValue(upload),
    stat: vi.fn().mockResolvedValue(HEADER),
    get: vi.fn().mockResolvedValue(response),
    getDownloadTarget: vi.fn().mockResolvedValue({ kind: "switchboard" }),
  };
  const access = {
    canReadAttachment: vi.fn(() =>
      decision instanceof Error
        ? Promise.reject(decision)
        : Promise.resolve(decision),
    ),
    admitCaller: vi.fn(() =>
      caller instanceof Error
        ? Promise.reject(caller)
        : Promise.resolve(caller),
    ),
  };
  const logger = { error: vi.fn() } as unknown as ILogger & {
    error: ReturnType<typeof vi.fn>;
  };
  const service = new AuthorizedAttachmentService(
    inner as unknown as IAttachmentService,
    access satisfies IAttachmentAccessService,
    options.subject ?? SUBJECT,
    logger,
  );
  return { service, inner, access, logger, response, upload };
}

function noInnerCalls(inner: ReturnType<typeof setup>["inner"]): void {
  expect(inner.reserve).not.toHaveBeenCalled();
  expect(inner.stat).not.toHaveBeenCalled();
  expect(inner.get).not.toHaveBeenCalled();
  expect(inner.getDownloadTarget).not.toHaveBeenCalled();
}

const reads = {
  get: (s: AuthorizedAttachmentService, documentId?: string) =>
    s.get(CALLER_REF, { documentId }),
  stat: (s: AuthorizedAttachmentService, documentId?: string) =>
    s.stat(CALLER_REF, { documentId }),
  getDownloadTarget: (s: AuthorizedAttachmentService, documentId?: string) =>
    s.getDownloadTarget(CALLER_REF, { documentId: documentId as string }),
};

describe("AuthorizedAttachmentService reads", () => {
  it("get forwards the canonical document id and ref, keeping the signal", async () => {
    const { service, inner, response } = setup();
    const signal = new AbortController().signal;

    await expect(
      service.get(CALLER_REF, { documentId: CALLER_DOC, signal }),
    ).resolves.toBe(response);

    expect(inner.get).toHaveBeenCalledWith(CANONICAL_REF, {
      documentId: CANONICAL_DOC,
      signal,
    });
  });

  it("stat forwards the canonical document id and ref", async () => {
    const { service, inner } = setup();

    await expect(
      service.stat(CALLER_REF, { documentId: CALLER_DOC }),
    ).resolves.toBe(HEADER);

    expect(inner.stat).toHaveBeenCalledWith(CANONICAL_REF, {
      documentId: CANONICAL_DOC,
    });
  });

  it("getDownloadTarget is decided before it delegates, keeping expiresIn", async () => {
    const { service, inner, access } = setup();

    await service.getDownloadTarget(CALLER_REF, {
      documentId: CALLER_DOC,
      expiresIn: 60,
    });

    expect(access.canReadAttachment).toHaveBeenCalledBefore(
      inner.getDownloadTarget,
    );
    expect(inner.getDownloadTarget).toHaveBeenCalledWith(CANONICAL_REF, {
      documentId: CANONICAL_DOC,
      expiresIn: 60,
    });
  });

  it("passes the subject's address and key to access", async () => {
    const { service, access } = setup();

    await service.get(CALLER_REF, { documentId: CALLER_DOC });

    expect(access.admitCaller).toHaveBeenCalledWith({
      intent: "read",
      userAddress: SUBJECT.address,
      appKey: SUBJECT.key,
    });
    expect(access.canReadAttachment).toHaveBeenCalledWith({
      documentId: CALLER_DOC,
      attachmentRef: CALLER_REF,
      userAddress: SUBJECT.address,
      appKey: SUBJECT.key,
    });
  });

  for (const [name, read] of Object.entries(reads)) {
    describe(name, () => {
      it("denied throws AttachmentNotFound with no inner call", async () => {
        const { service, inner } = setup({ decision: { kind: "denied" } });

        await expect(read(service, CALLER_DOC)).rejects.toBeInstanceOf(
          AttachmentNotFound,
        );
        noInnerCalls(inner);
      });

      it("projection-unavailable throws AttachmentAccessUnavailable", async () => {
        const { service, inner } = setup({
          decision: { kind: "projection-unavailable" },
        });

        await expect(read(service, CALLER_DOC)).rejects.toBeInstanceOf(
          AttachmentAccessUnavailable,
        );
        noInnerCalls(inner);
      });

      it("unauthenticated throws AuthenticationRequiredError before the document decides", async () => {
        const { service, inner, access } = setup({
          caller: { kind: "unauthenticated" },
        });

        await expect(read(service, CALLER_DOC)).rejects.toBeInstanceOf(
          AuthenticationRequiredError,
        );
        expect(access.canReadAttachment).not.toHaveBeenCalled();
        noInnerCalls(inner);
      });

      for (const [label, documentId] of [
        ["missing", undefined],
        ["empty", ""],
        ["blank", "   "],
        ["oversized", "d".repeat(513)],
      ] as const) {
        it(`a ${label} documentId refuses without calling access`, async () => {
          const { service, inner, access } = setup();

          await expect(read(service, documentId)).rejects.toBeInstanceOf(
            AttachmentNotFound,
          );
          expect(access.admitCaller).not.toHaveBeenCalled();
          expect(access.canReadAttachment).not.toHaveBeenCalled();
          noInnerCalls(inner);
        });
      }

      it("accepts a documentId at the route's length bound", async () => {
        const { service, access } = setup();

        await read(service, "d".repeat(512));

        expect(access.canReadAttachment).toHaveBeenCalled();
      });
    });
  }

  it("the bare AbortSignal form of get refuses without calling access", async () => {
    const { service, inner, access } = setup();

    await expect(
      service.get(CALLER_REF, new AbortController().signal),
    ).rejects.toBeInstanceOf(AttachmentNotFound);
    await expect(service.get(CALLER_REF)).rejects.toBeInstanceOf(
      AttachmentNotFound,
    );
    expect(access.admitCaller).not.toHaveBeenCalled();
    expect(access.canReadAttachment).not.toHaveBeenCalled();
    noInnerCalls(inner);
  });

  it("a class instance or foreign-prototype options object is accepted", async () => {
    class Options {
      documentId = CALLER_DOC;
    }
    const nullProto = Object.assign(Object.create(null) as object, {
      documentId: CALLER_DOC,
    });
    const foreignProto = Object.assign(Object.create({ other: 1 }) as object, {
      documentId: CALLER_DOC,
    });

    for (const options of [new Options(), nullProto, foreignProto]) {
      const { service, inner, access, response } = setup();

      await expect(
        service.get(CALLER_REF, options as { documentId: string }),
      ).resolves.toBe(response);
      expect(access.canReadAttachment).toHaveBeenCalledWith(
        expect.objectContaining({ documentId: CALLER_DOC }),
      );
      expect(inner.get).toHaveBeenCalledWith(
        CANONICAL_REF,
        expect.objectContaining({ documentId: CANONICAL_DOC }),
      );
    }
  });

  it("an AbortSignal-like object carrying a documentId refuses", async () => {
    const realSignal = Object.assign(new AbortController().signal, {
      documentId: CALLER_DOC,
    });
    const foreignSignal = {
      aborted: false,
      addEventListener: () => {},
      documentId: CALLER_DOC,
    };

    for (const options of [realSignal, foreignSignal]) {
      const { service, access } = setup();

      await expect(
        service.get(CALLER_REF, options as unknown as AbortSignal),
      ).rejects.toBeInstanceOf(AttachmentNotFound);
      expect(access.canReadAttachment).not.toHaveBeenCalled();
    }
  });

  it("a canReadAttachment exception is logged and becomes AttachmentAccessFailed", async () => {
    const cause = new Error("read side down");
    const { service, inner, logger } = setup({ decision: cause });

    const err = await service
      .get(CALLER_REF, { documentId: CALLER_DOC })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AttachmentAccessFailed);
    expect((err as Error).cause).toBe(cause);
    expect(logger.error).toHaveBeenCalledWith(expect.any(String), cause);
    noInnerCalls(inner);
  });

  it("an admitCaller exception is logged and becomes AttachmentAccessFailed", async () => {
    const cause = new Error("admit failed");
    const { service, access, logger } = setup({ caller: cause });

    const err = await service
      .stat(CALLER_REF, { documentId: CALLER_DOC })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AttachmentAccessFailed);
    expect((err as Error).cause).toBe(cause);
    expect(logger.error).toHaveBeenCalledWith(expect.any(String), cause);
    expect(access.canReadAttachment).not.toHaveBeenCalled();
  });

  it("an error from inner propagates unchanged and is not logged", async () => {
    const { service, inner, logger } = setup();
    const innerError = new AttachmentNotFound(HASH);
    inner.get.mockRejectedValueOnce(innerError);

    await expect(
      service.get(CALLER_REF, { documentId: CALLER_DOC }),
    ).rejects.toBe(innerError);
    expect(logger.error).not.toHaveBeenCalled();
  });
});

describe("AuthorizedAttachmentService.reserve", () => {
  it("admits a writer and delegates the handle unwrapped", async () => {
    const { service, inner, access, upload } = setup();

    await expect(service.reserve(HASH_FIRST)).resolves.toBe(upload);

    expect(access.admitCaller).toHaveBeenCalledWith({
      intent: "write",
      userAddress: SUBJECT.address,
      appKey: SUBJECT.key,
    });
    expect(inner.reserve).toHaveBeenCalledWith(HASH_FIRST);
  });

  it("reads each option once, so the checks and the delegate see the same values", async () => {
    const { service, inner } = setup();
    let reads = 0;
    const options = {
      mimeType: "text/plain",
      fileName: "a.txt",
      extension: "txt",
      sizeBytes: 1,
      get clientHash() {
        reads++;
        return reads === 1 ? HASH : null;
      },
    } as unknown as ReserveAttachmentOptions;

    await service.reserve(options);
    const readsByService = reads;

    const delegated = inner.reserve.mock.calls[0][0] as Record<string, unknown>;
    expect(delegated.clientHash).toBe(HASH);
    expect(delegated).toEqual(HASH_FIRST);
    expect(readsByService).toBe(1);
  });

  it("refuses an upload-first reservation without calling access", async () => {
    const { service, inner, access } = setup();

    await expect(
      service.reserve({ mimeType: "text/plain", fileName: "a.txt" }),
    ).rejects.toThrow(/client hash/);
    expect(access.admitCaller).not.toHaveBeenCalled();
    noInnerCalls(inner);
  });

  it("unauthenticated throws AuthenticationRequiredError with no inner call", async () => {
    const { service, inner } = setup({
      caller: { kind: "unauthenticated" },
      subject: {},
    });

    await expect(service.reserve(HASH_FIRST)).rejects.toBeInstanceOf(
      AuthenticationRequiredError,
    );
    noInnerCalls(inner);
  });

  for (const [field, value] of [
    ["mimeType", "text/plain\r\nX: y"],
    ["fileName", "a\nb.txt"],
    ["extension", "../x"],
  ] as const) {
    it(`refuses an invalid ${field} with no inner call`, async () => {
      const { service, inner } = setup();

      const err = await service
        .reserve({ ...HASH_FIRST, [field]: value })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(InvalidAttachmentMetadata);
      expect((err as InvalidAttachmentMetadata).field).toBe(field);
      noInnerCalls(inner);
    });
  }

  it("an admitCaller exception becomes AttachmentAccessFailed", async () => {
    const cause = new Error("admit failed");
    const { service, inner, logger } = setup({ caller: cause });

    const err = await service.reserve(HASH_FIRST).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AttachmentAccessFailed);
    expect((err as Error).cause).toBe(cause);
    expect(logger.error).toHaveBeenCalledWith(expect.any(String), cause);
    noInnerCalls(inner);
  });

  it("AttachmentAlreadyExists passes through", async () => {
    const { service, inner } = setup();
    const exists = new AttachmentAlreadyExists(HASH, CANONICAL_REF);
    inner.reserve.mockRejectedValueOnce(exists);

    await expect(service.reserve(HASH_FIRST)).rejects.toBe(exists);
  });
});

describe("AttachmentClientProvider", () => {
  it("forSubject(...).download goes through the gate", async () => {
    const { inner, access, logger } = setup({ decision: { kind: "denied" } });
    const provider = new AttachmentClientProvider(
      inner as unknown as IAttachmentService,
      access,
      logger,
    );

    await expect(
      provider
        .forSubject(SUBJECT)
        .download({ ref: CALLER_REF, documentId: CALLER_DOC }),
    ).rejects.toBeInstanceOf(AttachmentNotFound);
    expect(access.canReadAttachment).toHaveBeenCalledWith({
      documentId: CALLER_DOC,
      attachmentRef: CALLER_REF,
      userAddress: SUBJECT.address,
      appKey: SUBJECT.key,
    });
    noInnerCalls(inner);
  });

  it("binds the subject it is given", async () => {
    const { inner, access, logger, response } = setup();
    const provider = new AttachmentClientProvider(
      inner as unknown as IAttachmentService,
      access,
      logger,
    );

    await expect(
      provider
        .forSubject({ address: "0xother" })
        .download({ ref: CALLER_REF, documentId: CALLER_DOC }),
    ).resolves.toMatchObject({ header: response.header });
    expect(access.admitCaller).toHaveBeenCalledWith({
      intent: "read",
      userAddress: "0xother",
      appKey: undefined,
    });
  });
});
