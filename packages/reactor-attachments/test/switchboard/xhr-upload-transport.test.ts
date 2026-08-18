import type { AttachmentHash } from "@powerhousedao/reactor";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RemoteAttachmentUpload } from "../../src/switchboard/remote-attachment-upload.js";
import { createXhrUploadTransport } from "../../src/switchboard/xhr-upload-transport.js";
import type { AttachmentUploadRequest } from "../../src/switchboard/upload-transport.js";
import type { Reservation } from "../../src/types.js";

const HASH = "c".repeat(64) as AttachmentHash;
const REMOTE = "https://switchboard.example.com";

type Listener = (event: unknown) => void;

/**
 * Minimal XMLHttpRequest stand-in. Nothing is sent anywhere: the test drives
 * the lifecycle by hand, which is the only way to assert ordering (listeners
 * attached before `send`) and the status-0 cases a real server cannot produce.
 */
class FakeXhr {
  static instances: FakeXhr[] = [];

  status = 0;
  statusText = "";
  responseText = "";
  responseTypeAssigned = false;

  readonly openArgs: unknown[] = [];
  readonly headers: Array<[string, string]> = [];
  sentBody: unknown;
  sentAt = -1;
  aborted = false;

  private readonly listeners = new Map<string, Listener[]>();
  private readonly uploadListeners = new Map<string, Listener[]>();
  private attachOrder: string[] = [];

  readonly upload = {
    addEventListener: (type: string, listener: Listener) => {
      this.attachOrder.push(`upload:${type}`);
      const existing = this.uploadListeners.get(type) ?? [];
      existing.push(listener);
      this.uploadListeners.set(type, existing);
    },
  };

  constructor() {
    FakeXhr.instances.push(this);
  }

  set responseType(_value: string) {
    this.responseTypeAssigned = true;
  }

  open(...args: unknown[]): void {
    this.openArgs.push(...args);
  }

  setRequestHeader(name: string, value: string): void {
    this.headers.push([name, value]);
  }

  addEventListener(type: string, listener: Listener): void {
    this.attachOrder.push(type);
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  send(body: unknown): void {
    this.sentBody = body;
    this.sentAt = this.attachOrder.length;
  }

  abort(): void {
    this.aborted = true;
    this.emit("abort", {});
  }

  /** Listener types registered before `send` was called. */
  get listenersBeforeSend(): string[] {
    return this.attachOrder.slice(0, this.sentAt === -1 ? 0 : this.sentAt);
  }

  emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  emitUploadProgress(loaded: number, total: number, lengthComputable = true) {
    for (const listener of this.uploadListeners.get("progress") ?? []) {
      listener({ loaded, total, lengthComputable });
    }
  }

  complete(status: number, statusText: string, responseText = ""): void {
    this.status = status;
    this.statusText = statusText;
    this.responseText = responseText;
    this.emit("load", {});
  }
}

function installFakeXhr(): void {
  FakeXhr.instances = [];
  (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = FakeXhr;
}

function request(
  overrides: Partial<AttachmentUploadRequest> = {},
): AttachmentUploadRequest {
  return {
    url: "https://bucket.example.com/obj?X-Amz-Signature=sig",
    method: "PUT",
    headers: {
      "content-type": "application/pdf",
      "x-amz-checksum-sha256": "qqo=",
    },
    body: new Blob(["abc"]),
    ...overrides,
  };
}

describe("createXhrUploadTransport", () => {
  afterEach(() => {
    delete (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest;
  });

  it("falls back to fetch where XMLHttpRequest does not exist", async () => {
    // Node has none; this is the property that keeps the shared bundle safe.
    expect(globalThis.XMLHttpRequest).toBeUndefined();
    const fetchFn = vi.fn(() =>
      Promise.resolve(new Response(null, { status: 200 })),
    ) as unknown as typeof fetch;

    const response = await createXhrUploadTransport({ fetchFn })(request());

    expect(response.status).toBe(200);
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("detects the capability per call, not at module load", async () => {
    const transport = createXhrUploadTransport({
      fetchFn: vi.fn(() =>
        Promise.resolve(new Response(null, { status: 200 })),
      ) as unknown as typeof fetch,
    });

    // Built while XHR was absent, then used after one appears.
    installFakeXhr();
    const pending = transport(request());
    FakeXhr.instances[0].complete(200, "OK");

    await expect(pending).resolves.toMatchObject({ status: 200 });
  });

  it("opens asynchronously with the request's method and url", async () => {
    installFakeXhr();
    const pending = createXhrUploadTransport()(request());
    const xhr = FakeXhr.instances[0];
    xhr.complete(200, "OK");
    await pending;

    expect(xhr.openArgs).toEqual([
      "PUT",
      "https://bucket.example.com/obj?X-Amz-Signature=sig",
      true,
    ]);
  });

  it("forwards headers verbatim, with no additions and no case changes", async () => {
    installFakeXhr();
    const pending = createXhrUploadTransport()(request());
    const xhr = FakeXhr.instances[0];
    xhr.complete(200, "OK");
    await pending;

    expect(xhr.headers).toEqual([
      ["content-type", "application/pdf"],
      ["x-amz-checksum-sha256", "qqo="],
    ]);
  });

  it("never assigns responseType, so a non-JSON error body stays readable", async () => {
    installFakeXhr();
    const pending = createXhrUploadTransport()(request());
    const xhr = FakeXhr.instances[0];
    xhr.complete(422, "Unprocessable Entity", "<html>nope</html>");
    const response = await pending;

    expect(xhr.responseTypeAssigned).toBe(false);
    await expect(response.json()).rejects.toThrow();
  });

  it("sends the body unchanged", async () => {
    installFakeXhr();
    const body = new Blob(["payload"]);
    const pending = createXhrUploadTransport()(request({ body }));
    const xhr = FakeXhr.instances[0];
    xhr.complete(200, "OK");
    await pending;

    expect(xhr.sentBody).toBe(body);
  });

  it("attaches the upload progress listener before send", async () => {
    installFakeXhr();
    const onProgress = vi.fn();
    const pending = createXhrUploadTransport()(request({ onProgress }));
    const xhr = FakeXhr.instances[0];

    expect(xhr.listenersBeforeSend).toContain("upload:progress");

    xhr.emitUploadProgress(2, 3);
    xhr.complete(200, "OK");
    await pending;

    expect(onProgress).toHaveBeenCalledWith(2, 3);
  });

  it("registers no upload listener when nobody is watching (avoids a preflight)", async () => {
    installFakeXhr();
    const pending = createXhrUploadTransport()(request());
    const xhr = FakeXhr.instances[0];
    xhr.complete(200, "OK");
    await pending;

    expect(xhr.listenersBeforeSend).not.toContain("upload:progress");
  });

  it("ignores a progress event whose length is not computable", async () => {
    installFakeXhr();
    const onProgress = vi.fn();
    const pending = createXhrUploadTransport()(request({ onProgress }));
    const xhr = FakeXhr.instances[0];
    xhr.emitUploadProgress(2, 0, false);
    xhr.complete(200, "OK");
    await pending;

    expect(onProgress).not.toHaveBeenCalled();
  });

  it("exposes status, statusText, ok and a parsed json body", async () => {
    installFakeXhr();
    const pending = createXhrUploadTransport()(request());
    FakeXhr.instances[0].complete(200, "OK", '{"hash":"abc"}');
    const response = await pending;

    expect(response.status).toBe(200);
    expect(response.statusText).toBe("OK");
    expect(response.ok).toBe(true);
    await expect(response.json()).resolves.toEqual({ hash: "abc" });
  });

  it("reports a non-2xx as not ok rather than rejecting", async () => {
    installFakeXhr();
    const pending = createXhrUploadTransport()(request());
    FakeXhr.instances[0].complete(403, "Forbidden");
    const response = await pending;

    expect(response.ok).toBe(false);
    expect(response.status).toBe(403);
  });

  it("rejects rather than resolving on status 0", async () => {
    installFakeXhr();
    const pending = createXhrUploadTransport()(request());
    // A CORS refusal reaches `load` with status 0; resolving would fabricate a
    // transfer error claiming the provider answered 0.
    FakeXhr.instances[0].complete(0, "");

    await expect(pending).rejects.toBeInstanceOf(TypeError);
  });

  it("rejects with a fetch-shaped TypeError on a network error", async () => {
    installFakeXhr();
    const pending = createXhrUploadTransport()(request());
    FakeXhr.instances[0].emit("error", {});

    await expect(pending).rejects.toBeInstanceOf(TypeError);
  });

  it("rejects with a TypeError on timeout", async () => {
    installFakeXhr();
    const pending = createXhrUploadTransport()(request());
    FakeXhr.instances[0].emit("timeout", {});

    await expect(pending).rejects.toBeInstanceOf(TypeError);
  });

  it("aborts the request when the caller's signal fires", async () => {
    installFakeXhr();
    const controller = new AbortController();
    const pending = createXhrUploadTransport()(
      request({ signal: controller.signal }),
    );
    const xhr = FakeXhr.instances[0];

    controller.abort();
    const error = await pending.then(
      () => null,
      (err: unknown) => err,
    );

    expect(xhr.aborted).toBe(true);
    expect((error as Error).name).toBe("AbortError");
  });

  it("rejects a pre-aborted request without opening a connection", async () => {
    installFakeXhr();
    const controller = new AbortController();
    controller.abort();

    const error = await createXhrUploadTransport()(
      request({ signal: controller.signal }),
    ).then(
      () => null,
      (err: unknown) => err,
    );

    expect((error as Error).name).toBe("AbortError");
    expect(FakeXhr.instances[0].openArgs).toEqual([]);
  });

  it("settles exactly once when several terminal events arrive", async () => {
    installFakeXhr();
    const pending = createXhrUploadTransport()(request());
    const xhr = FakeXhr.instances[0];

    xhr.complete(200, "OK", "{}");
    xhr.emit("error", {});
    xhr.abort();

    await expect(pending).resolves.toMatchObject({ status: 200 });
  });
});

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

describe("uploadTransport config resolution", () => {
  afterEach(() => {
    delete (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest;
  });

  it("routes uploads through a configured transport", async () => {
    const uploadTransport = vi.fn(() =>
      Promise.resolve({
        status: 200,
        statusText: "OK",
        ok: true,
        json: () => Promise.resolve({ hash: HASH, ref: "r", header: {} }),
      }),
    );
    const upload = new RemoteAttachmentUpload(reservation(), {
      remoteUrl: REMOTE,
      uploadTransport,
    });

    await upload.send(new Blob(["abc"]).stream());

    expect(uploadTransport).toHaveBeenCalledOnce();
  });

  it("lets an explicit fetchFn win, so adding uploadTransport is a no-op", async () => {
    const fetchFn = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ hash: HASH, ref: "r", header: {} }), {
          status: 200,
        }),
      ),
    ) as unknown as typeof fetch;
    const uploadTransport = vi.fn();
    const upload = new RemoteAttachmentUpload(reservation(), {
      remoteUrl: REMOTE,
      fetchFn,
      uploadTransport,
    });

    await upload.send(new Blob(["abc"]).stream());

    expect(fetchFn).toHaveBeenCalledOnce();
    expect(uploadTransport).not.toHaveBeenCalled();
  });

  it("carries upload byte progress from the transport to the caller", async () => {
    installFakeXhr();
    const upload = new RemoteAttachmentUpload(reservation(), {
      remoteUrl: REMOTE,
      uploadTransport: createXhrUploadTransport(),
    });
    const observed: Array<[number, number | undefined]> = [];

    const sent = upload.send(new Blob(["abc"]).stream(), {
      onProgress: (loaded, total) => observed.push([loaded, total]),
    });
    // The body is buffered before the request is issued, so yield first.
    await vi.waitFor(() => expect(FakeXhr.instances).toHaveLength(1));
    const xhr = FakeXhr.instances[0];
    xhr.emitUploadProgress(1, 3);
    xhr.emitUploadProgress(3, 3);
    xhr.complete(
      200,
      "OK",
      JSON.stringify({ hash: HASH, ref: "r", header: {} }),
    );
    await sent;

    expect(observed).toEqual([
      [1, 3],
      [3, 3],
    ]);
  });
});
