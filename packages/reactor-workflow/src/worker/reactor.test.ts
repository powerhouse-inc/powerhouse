// The worker's ctx.reactor drives over a real reactor RPC pair: what a piece
// calls in the child reaches the host's served facade, and refusals match.
import { context as otelContext } from "@opentelemetry/api";
import type {
  ReactorClient,
  RequireReactor,
} from "@powerhousedao/pieces-framework";
import {
  createPortTransport,
  createReactorClientProxy,
  DocumentModelRegistry,
  MessageRouter,
  ReactorHostServer,
} from "@powerhousedao/reactor/rpc";
import type { PHDocument } from "@powerhousedao/shared/document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { servedClient } from "../reactor/reactor-session.js";
import { WorkflowTelemetry, tracedMethods } from "../telemetry.js";
import { RequestGuard, sessionClient, type Runtime } from "./reactor.js";

const draft = {
  header: {
    id: "file-1",
    documentType: "test/file",
    name: "Invoice",
    branch: "main",
    meta: { preferredEditor: "invoice-editor" },
  },
  state: { global: { total: 12 } },
  operations: {},
} as unknown as PHDocument;

function hostClient() {
  const drives = {
    getNode: vi.fn(() => Promise.resolve({ id: "node-1", kind: "folder" })),
    listNodes: vi.fn(),
    addFile: vi.fn((_drive: string, document: PHDocument, _parent?: string) =>
      Promise.resolve(document),
    ),
    addFolder: vi.fn(),
  };
  // A handle with no job: its stages are settled, and only `document()` reads.
  const handle = (documentId: string) => ({
    jobId: "",
    jobIds: [],
    documentId,
    branch: "main",
    document: () => Promise.resolve(draft),
  });
  const write = {
    execute: vi.fn((documentId: string) => Promise.resolve(handle(documentId))),
    // A handle on a job, so its stages and document read go over `read`.
    deleteDocument: vi.fn((documentId: string) =>
      Promise.resolve({
        ...handle(documentId),
        jobId: "job-1",
        jobIds: ["job-1"],
      }),
    ),
    drives: {
      addFile: vi.fn((drive: string) => Promise.resolve(handle(drive))),
      addFolder: vi.fn(),
    },
  };
  // The job never settles, so a stage waits until the step closes.
  const read = {
    waitForJob: vi.fn(() => new Promise(() => undefined)),
    getJobStatus: vi.fn(() => new Promise(() => undefined)),
    get: vi.fn(() => Promise.resolve(draft)),
  };
  return { drives, write, read } as unknown as ReactorClient & {
    drives: typeof drives;
    write: typeof write;
    read: typeof read;
  };
}

const closers: (() => void)[] = [];

afterEach(() => {
  for (const close of closers.splice(0)) close();
});

// A worker session over a MessageChannel to a host serving `host`, optionally traced.
function connect(
  host: ReactorClient,
  telemetry?: WorkflowTelemetry,
  requireReactor: RequireReactor = "write",
) {
  const channel = new MessageChannel();
  const served = servedClient(host);
  const server = new ReactorHostServer(
    telemetry
      ? tracedMethods(served, telemetry, "reactor", otelContext.active(), [
          "drives",
          "write",
        ])
      : served,
    createPortTransport(channel.port1),
  );
  server.start();
  const router = new MessageRouter("w");
  router.attach(createPortTransport(channel.port2));
  const proxy = createReactorClientProxy(router, {
    registry: new DocumentModelRegistry(),
  });
  const guard = new RequestGuard();
  let open = true;
  const close = () => {
    if (!open) return;
    open = false;
    guard.close();
    router.detach();
    server.stop();
    channel.port1.close();
    channel.port2.close();
  };
  closers.push(close);
  return {
    proxy,
    client: sessionClient({} as Runtime, proxy, guard, requireReactor),
    close,
  };
}

describe("ctx.reactor.drives in the worker", () => {
  it("files a draft document through the host facade with the same arguments", async () => {
    const host = hostClient();
    const { client } = connect(host);

    const answer = await client.drives.addFile("drive-1", draft, "folder-1");

    expect(host.drives.addFile).toHaveBeenCalledTimes(1);
    const [drive, document, parent] = host.drives.addFile.mock.calls[0];
    expect([drive, parent]).toEqual(["drive-1", "folder-1"]);
    expect(document).toEqual(draft);
    expect(answer).toEqual(draft);
  });

  it("serves a drive read", async () => {
    const host = hostClient();
    const { client } = connect(host);

    await expect(client.drives.getNode("drive-1", "node-1")).resolves.toEqual({
      id: "node-1",
      kind: "folder",
    });
  });

  it("holds a drives object of its own, without a prototype", () => {
    const { client, proxy } = connect(hostClient());

    expect(Object.getPrototypeOf(client.drives)).toBeNull();
    expect(client.drives).not.toBe(proxy.drives);
  });

  it("refuses removeNode in the worker, as the host does", async () => {
    const host = hostClient();
    const { client, proxy } = connect(host);
    const drives = client.drives as unknown as Record<string, () => unknown>;

    let local: unknown;
    try {
      drives.removeNode();
    } catch (error) {
      local = error;
    }
    const remote = await proxy.drives
      .removeNode("drive-1", "node-1")
      .catch((error: unknown) => error);

    for (const error of [local, remote]) {
      expect(error).toMatchObject({
        name: "ReactorAccessDeniedError",
        message: "drives.removeNode is not available to workflow pieces",
      });
    }
  });

  it("traces drive calls on the host as reactor.drives.*", async () => {
    const telemetry = new WorkflowTelemetry();
    const phases = vi.spyOn(telemetry, "recordPhase");
    const { client } = connect(hostClient(), telemetry);

    await client.drives.addFile("drive-1", draft);

    expect(phases.mock.calls.map(([phase]) => phase)).toContain(
      "reactor.drives.addFile",
    );
  });
});

describe("ctx.reactor.write in the worker", () => {
  it("sends a write over RPC and answers with a handle rebuilt from its ids", async () => {
    const host = hostClient();
    const { client } = connect(host);

    const handle = await client.write.execute("doc-1", "main", []);

    expect(host.write.execute.mock.calls[0].slice(0, 2)).toEqual([
      "doc-1",
      "main",
    ]);
    expect(handle).toMatchObject({ jobId: "", documentId: "doc-1" });
    await expect(handle.readable).resolves.toMatchObject({
      documentId: "doc-1",
      job: { status: "READ_READY" },
    });
  });

  it("refuses a write the half does not offer, in the worker and on the host", async () => {
    const { client, proxy } = connect(hostClient());
    const write = client.write as unknown as Record<string, () => unknown>;

    expect(() => write.rename()).toThrow(
      "write.rename is not available to workflow pieces",
    );
    await expect(proxy.write.rename("doc-1", "Nope")).rejects.toMatchObject({
      name: "ReactorAccessDeniedError",
      message: "write.rename is not available to workflow pieces",
    });
    await expect(
      proxy.write.drives.removeNode("drive-1", "node-1"),
    ).rejects.toMatchObject({
      message: "write.drives.removeNode is not available to workflow pieces",
    });
  });

  it("closes a handle's stages and document read with the step", async () => {
    const host = hostClient();
    const { client, close } = connect(host);
    const handle = await client.write.deleteDocument("doc-1");
    const pending = handle.readable;
    await vi.waitFor(() => expect(host.read.waitForJob).toHaveBeenCalled());

    close();

    const closed = { name: "ReactorRequestClosedError" };
    await expect(pending).rejects.toMatchObject(closed);
    await expect(handle.written).rejects.toMatchObject(closed);
    await expect(handle.document()).rejects.toMatchObject(closed);
    expect(host.read.get).not.toHaveBeenCalled();
  });

  it("refuses every write of a read declaration's write half", () => {
    const host = hostClient();
    const { client } = connect(host, undefined, "read");

    for (const call of [
      () => client.write.execute("doc-1", "main", []),
      () => client.write.drives.addFile("drive-1", draft),
      () => (client.write as unknown as Record<string, () => unknown>).rename(),
    ]) {
      expect(call).toThrow(/declares read access only$/);
      expect(call).toThrow(
        expect.objectContaining({ name: "ReactorAccessDeniedError" }),
      );
    }
    expect(host.write.execute).not.toHaveBeenCalled();
    expect(host.write.drives.addFile).not.toHaveBeenCalled();
  });

  it("traces write calls on the host as reactor.write.*", async () => {
    const telemetry = new WorkflowTelemetry();
    const phases = vi.spyOn(telemetry, "recordPhase");
    const { client } = connect(hostClient(), telemetry);

    await client.write.drives.addFile("drive-1", draft);

    expect(phases.mock.calls.map(([phase]) => phase)).toContain(
      "reactor.write.drives.addFile",
    );
  });
});
