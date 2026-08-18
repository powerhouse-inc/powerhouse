import type { AttachmentHash } from "@powerhousedao/reactor";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RemoteAttachmentUpload } from "../../src/switchboard/remote-attachment-upload.js";
import type { Reservation } from "../../src/types.js";

const HASH = "b".repeat(64) as AttachmentHash;
const REMOTE = "https://switchboard.example.com";

function reservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    reservationId: "res-1",
    mimeType: "application/pdf",
    fileName: "f.pdf",
    extension: "pdf",
    createdAtUtc: "2026-07-23T00:00:00.000Z",
    expiresAtUtc: "2027-01-01T00:00:00.000Z",
    clientHash: HASH,
    sizeBytes: 3,
    ...overrides,
  };
}

const PRESIGNED_PUT = {
  kind: "presigned-put" as const,
  method: "PUT" as const,
  url: "https://bucket.example.com/attachments/bb/bb/obj?X-Amz-Signature=sig",
  headers: { "content-type": "application/pdf" },
  expiresAtUtc: "2027-01-01T00:00:00.000Z",
};

function bytes(): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("abc"));
      controller.close();
    },
  });
}

function recordingFetch(response: Response) {
  const inits: RequestInit[] = [];
  const fetchFn = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    inits.push(init ?? {});
    return Promise.resolve(response);
  }) as unknown as typeof fetch;
  return { fetchFn, inits };
}

describe("IAttachmentUpload.send options", () => {
  it("forwards the caller's signal on the reservation PUT path", async () => {
    const { fetchFn, inits } = recordingFetch(
      new Response(JSON.stringify({ hash: HASH, ref: "r", header: {} }), {
        status: 200,
      }),
    );
    const upload = new RemoteAttachmentUpload(reservation(), {
      remoteUrl: REMOTE,
      fetchFn,
    });
    const controller = new AbortController();

    await upload.send(bytes(), { signal: controller.signal });

    expect(inits[0].signal).toBe(controller.signal);
  });

  it("forwards the caller's signal on the presigned path", async () => {
    const { fetchFn, inits } = recordingFetch(
      new Response(null, { status: 200 }),
    );
    const upload = new RemoteAttachmentUpload(
      reservation({ uploadTarget: PRESIGNED_PUT }),
      { remoteUrl: REMOTE, fetchFn },
    );
    const controller = new AbortController();

    await upload.send(bytes(), { signal: controller.signal });

    expect(inits[0].signal).toBe(controller.signal);
  });

  it("omits signal entirely when the caller passes none", async () => {
    const { fetchFn, inits } = recordingFetch(
      new Response(null, { status: 200 }),
    );
    const upload = new RemoteAttachmentUpload(
      reservation({ uploadTarget: PRESIGNED_PUT }),
      { remoteUrl: REMOTE, fetchFn },
    );

    await upload.send(bytes(), {});

    expect("signal" in inits[0]).toBe(false);
  });

  it("accepts onProgress without requiring the transport to call it", async () => {
    const { fetchFn } = recordingFetch(new Response(null, { status: 200 }));
    const upload = new RemoteAttachmentUpload(
      reservation({ uploadTarget: PRESIGNED_PUT }),
      { remoteUrl: REMOTE, fetchFn },
    );
    const onProgress = vi.fn();

    await upload.send(bytes(), { onProgress });

    // fetch cannot observe upload bytes; silence is the honest answer.
    expect(onProgress).not.toHaveBeenCalled();
  });
});

describe("send cancellation against a real server", () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (!server) return;
    const closing = server;
    server = undefined;
    await new Promise<void>((resolve) => closing.close(() => resolve()));
  });

  it("aborts an in-flight upload on the fetch path", async () => {
    const requestReceived = new Promise<void>((resolveReceived) => {
      server = createServer((req: IncomingMessage, res: ServerResponse) => {
        req.resume();
        resolveReceived();
        // Never respond: the abort is the only thing that can settle this.
        void res;
      });
    });
    const port = await new Promise<number>((resolve) => {
      server!.listen(0, "127.0.0.1", () => {
        const address = server!.address();
        resolve(typeof address === "object" && address ? address.port : 0);
      });
    });

    const upload = new RemoteAttachmentUpload(reservation(), {
      remoteUrl: `http://127.0.0.1:${port}`,
    });
    const controller = new AbortController();

    const sent = upload.send(bytes(), { signal: controller.signal });
    const settled = sent.then(
      () => null,
      (err: unknown) => err,
    );
    await requestReceived;
    controller.abort();

    const error = await settled;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).toBe("AbortError");
  });
});
