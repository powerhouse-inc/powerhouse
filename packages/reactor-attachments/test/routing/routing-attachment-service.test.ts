import type { AttachmentRef } from "@powerhousedao/reactor";
import { describe, expect, it, vi } from "vitest";
import { createAttachmentClient } from "../../src/client.js";
import type {
  IAttachmentService,
  IAttachmentUpload,
} from "../../src/interfaces.js";
import { RoutingAttachmentService } from "../../src/routing/routing-attachment-service.js";
import type {
  AttachmentHeader,
  AttachmentResponse,
  ReserveAttachmentOptions,
} from "../../src/types.js";

const REF = `attachment://v1:${"a".repeat(64)}` as AttachmentRef;

type Call = { method: string; args: unknown[] };

function fakeService(name: string): IAttachmentService & { calls: Call[] } {
  const calls: Call[] = [];
  const header = { ref: REF, mimeType: name } as unknown as AttachmentHeader;
  return {
    calls,
    reserve(options: ReserveAttachmentOptions) {
      calls.push({ method: "reserve", args: [options] });
      return Promise.resolve({
        reservationId: name,
      } as unknown as IAttachmentUpload);
    },
    stat(ref, options) {
      calls.push({ method: "stat", args: [ref, options] });
      return Promise.resolve(header);
    },
    get(ref, options) {
      calls.push({ method: "get", args: [ref, options] });
      return Promise.resolve({ header } as unknown as AttachmentResponse);
    },
    getDownloadTarget(ref, options) {
      calls.push({ method: "getDownloadTarget", args: [ref, options] });
      return Promise.resolve({ url: name } as never);
    },
  };
}

function setup(homes: Record<string, string> = {}) {
  const sb = fakeService("sb");
  const other = fakeService("other");
  const fallback = fakeService("fallback");
  const resolve = vi.fn((documentId: string) =>
    Promise.resolve(homes[documentId] ?? "connect-local"),
  );
  const service = new RoutingAttachmentService(
    resolve,
    new Map([
      ["sb", sb],
      ["other", other],
    ]),
    fallback,
  );
  return { sb, other, fallback, resolve, service };
}

describe("RoutingAttachmentService", () => {
  it("downloads from the service of the backend that serves the document", async () => {
    const { other, fallback, service } = setup({ doc: "other" });

    await service.get(REF, { documentId: "doc" });
    await service.stat(REF, { documentId: "doc" });
    await service.getDownloadTarget(REF, { documentId: "doc" });

    expect(other.calls.map((call) => call.method)).toEqual([
      "get",
      "stat",
      "getDownloadTarget",
    ]);
    expect(fallback.calls).toEqual([]);
  });

  it("reserves on the document's backend and leaves documentId out of what it forwards", async () => {
    const { sb, service } = setup({ doc: "sb" });

    const upload = await service.reserve({
      mimeType: "text/plain",
      fileName: "a.txt",
      documentId: "doc",
    });

    expect(upload.reservationId).toBe("sb");
    expect(sb.calls[0].args[0]).toEqual({
      mimeType: "text/plain",
      fileName: "a.txt",
    });
  });

  it("sends a reservation without a document to the fallback", async () => {
    const { fallback, resolve, service } = setup();

    await service.reserve({ mimeType: "text/plain", fileName: "a.txt" });
    await service.get(REF);
    await service.get(REF, new AbortController().signal);

    expect(fallback.calls.map((call) => call.method)).toEqual([
      "reserve",
      "get",
      "get",
    ]);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("uses the fallback for a backend with no service of its own", async () => {
    const { fallback, service } = setup({ doc: "connect-local" });

    await service.get(REF, { documentId: "doc" });

    expect(fallback.calls.map((call) => call.method)).toEqual(["get"]);
  });

  it("uses the fallback when the document cannot be located", async () => {
    const { fallback, resolve, service } = setup();
    resolve.mockRejectedValueOnce(new Error("no backend answered"));

    await service.stat(REF, { documentId: "doc" });

    expect(fallback.calls.map((call) => call.method)).toEqual(["stat"]);
  });

  it("stops when the download is aborted while locating", async () => {
    const { fallback, resolve, service } = setup();
    const controller = new AbortController();
    const aborted = new Error("aborted");
    resolve.mockImplementationOnce(() => {
      controller.abort(aborted);
      return Promise.reject(aborted);
    });

    await expect(
      service.get(REF, { documentId: "doc", signal: controller.signal }),
    ).rejects.toBe(aborted);
    expect(fallback.calls).toEqual([]);
  });

  it("routes an upload by the document preprocess was given", async () => {
    const { sb, service } = setup({ doc: "sb" });
    const client = createAttachmentClient(service);

    const pre = await client.preprocess(new Blob(["hi"]), {
      fileName: "hi.txt",
      mimeType: "text/plain",
      documentId: "doc",
    });
    await client.reserve(pre.options, () => Promise.resolve({} as never));

    expect(sb.calls.map((call) => call.method)).toEqual(["reserve"]);
  });
});
