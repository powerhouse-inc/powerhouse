import type { AttachmentHash } from "@powerhousedao/reactor";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAttachmentClient } from "../../src/client.js";
import type { IAttachmentService } from "../../src/interfaces.js";
import { RemoteAttachmentUpload } from "../../src/switchboard/remote-attachment-upload.js";
import { createXhrUploadTransport } from "../../src/switchboard/xhr-upload-transport.js";
import type { Reservation } from "../../src/types.js";
import { FakeXhr, installFakeXhr } from "./fake-xhr.js";

/**
 * The upload-progress listener is guarded at three layers: the client decides
 * whether to instrument at all, `RemoteAttachmentUpload` forwards the option,
 * and the XHR transport registers the listener. Each layer is unit-tested, and
 * the composition still went wrong -- registering `upload.onprogress` forces a
 * CORS preflight, so an upload nobody is watching must reach the provider
 * without one. These tests assert the whole chain.
 */
const HASH = "d".repeat(64) as AttachmentHash;
const REMOTE = "https://switchboard.example.com";

const PRESIGNED_PUT = {
  kind: "presigned-put" as const,
  method: "PUT" as const,
  url: "https://bucket.example.com/attachments/dd/dd/obj?X-Amz-Signature=sig",
  headers: { "content-type": "text/plain" },
  expiresAtUtc: "2027-01-01T00:00:00.000Z",
};

function presignedService(): IAttachmentService {
  const reservation: Reservation = {
    reservationId: "res-1",
    mimeType: "text/plain",
    fileName: "f.txt",
    extension: "txt",
    createdAtUtc: "2026-07-23T00:00:00.000Z",
    expiresAtUtc: "2027-01-01T00:00:00.000Z",
    clientHash: HASH,
    sizeBytes: 5,
    uploadTarget: PRESIGNED_PUT,
  };
  return {
    reserve: vi.fn(() =>
      Promise.resolve(
        new RemoteAttachmentUpload(reservation, {
          remoteUrl: REMOTE,
          uploadTransport: createXhrUploadTransport(),
        }),
      ),
    ),
    stat: vi.fn(),
    get: vi.fn(),
    getDownloadTarget: vi.fn(),
  } as unknown as IAttachmentService;
}

/** Waits for the XHR to exist and to have been sent. */
async function sentXhr(): Promise<FakeXhr> {
  return vi.waitFor(() => {
    const xhr = FakeXhr.instances.at(0);
    if (!xhr || xhr.sentAt === -1) throw new Error("xhr not sent yet");
    return xhr;
  });
}

describe("upload progress wiring, client to transport", () => {
  afterEach(() => {
    delete (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest;
  });

  it("registers no upload listener when the caller passed no onProgress", async () => {
    installFakeXhr();
    const client = createAttachmentClient(presignedService());

    const pending = client.upload({ file: new Blob(["hello"]) });
    const xhr = await sentXhr();

    expect(xhr.listenersBeforeSend).not.toContain("upload:progress");

    xhr.complete(200, "OK");
    await pending;
  });

  it("registers the upload listener and delivers bytes when the caller listens", async () => {
    installFakeXhr();
    const client = createAttachmentClient(presignedService());
    const loaded: number[] = [];

    const pending = client.upload(
      { file: new Blob(["hello"]) },
      {
        onProgress: (p) => {
          if (p.stage === "uploading" && !p.indeterminate)
            loaded.push(p.loaded);
        },
        throttleMs: 0,
      },
    );
    const xhr = await sentXhr();

    expect(xhr.listenersBeforeSend).toContain("upload:progress");

    xhr.emitUploadProgress(2, 5);
    xhr.emitUploadProgress(5, 5);
    xhr.complete(200, "OK");
    await pending;

    expect(loaded).toEqual([2, 5]);
  });
});
