// The worker's ctx.reactor drives over a real reactor RPC pair: what a piece
// calls in the child reaches the host's served facade, and refusals match.
import { context as otelContext } from "@opentelemetry/api";
import type { ReactorClient } from "@powerhousedao/pieces-framework";
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
  return { drives } as unknown as ReactorClient & {
    drives: typeof drives;
  };
}

const closers: (() => void)[] = [];

afterEach(() => {
  for (const close of closers.splice(0)) close();
});

// A worker session over a MessageChannel to a host serving `host`, optionally traced.
function connect(host: ReactorClient, telemetry?: WorkflowTelemetry) {
  const channel = new MessageChannel();
  const served = servedClient(host);
  const server = new ReactorHostServer(
    telemetry
      ? tracedMethods(served, telemetry, "reactor", otelContext.active(), [
          "drives",
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
  closers.push(() => {
    guard.close();
    router.detach();
    server.stop();
    channel.port1.close();
    channel.port2.close();
  });
  return {
    proxy,
    client: sessionClient({} as Runtime, proxy, guard),
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
