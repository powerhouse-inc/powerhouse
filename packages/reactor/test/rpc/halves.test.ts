import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import { actions } from "@powerhousedao/shared/document-model";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IReactorClient } from "../../src/client/types.js";
import { createReactorClientProxy } from "../../src/rpc/client-proxy.js";
import { ReactorHostServer } from "../../src/rpc/host-server.js";
import { MessageRouter } from "../../src/rpc/message-router.js";
import { createPortTransport } from "../../src/rpc/transport.js";
import { JobStatus } from "../../src/shared/types.js";
import {
  createInMemoryReactorClient,
  type InMemoryReactor,
} from "./reactor-fixture.js";

const DRIVE_TYPE = "powerhouse/document-drive";

function tabRouter(port: MessagePort): MessageRouter {
  const router = new MessageRouter();
  router.attach(createPortTransport(port));
  return router;
}

describe("RPC halves against a real in-memory reactor", () => {
  let reactor: InMemoryReactor;
  let channel: MessageChannel;
  let host: ReactorHostServer;
  let proxy: IReactorClient;

  beforeEach(async () => {
    reactor = await createInMemoryReactorClient();
    channel = new MessageChannel();
    host = new ReactorHostServer(
      reactor.client,
      createPortTransport(channel.port1),
    );
    host.start();
    proxy = createReactorClientProxy(tabRouter(channel.port2));
  });

  afterEach(async () => {
    host.stop();
    channel.port1.close();
    channel.port2.close();
    await reactor.dispose();
  });

  it("serves read.* from the host's read half", async () => {
    const created = await proxy.createEmpty<DocumentDriveDocument>(DRIVE_TYPE);

    const fetched = await proxy.read.get(created.header.id);
    const page = await proxy.read.find({ type: DRIVE_TYPE });

    expect(fetched.header.id).toBe(created.header.id);
    expect(page.results.map((doc) => doc.header.id)).toContain(
      created.header.id,
    );
  });

  it("returns a write.* handle whose stages and read-back work tab-side", async () => {
    const handle = await proxy.write.createEmpty(DRIVE_TYPE);
    expect(handle.jobId).toBeTruthy();
    expect(handle.documentId).toBeTruthy();

    const written = await handle.written;
    expect([JobStatus.WRITE_READY, JobStatus.READ_READY]).toContain(
      written.job.status,
    );
    const readable = await handle.readable;
    expect(readable.job.status).toBe(JobStatus.READ_READY);
    expect(readable.documentId).toBe(handle.documentId);

    const renamed = await proxy.write.rename(handle.documentId, "over-rpc");
    const document = await renamed.document();
    expect(document.header.name).toBe("over-rpc");
  });

  it("rebuilds write.drives handles, node id included", async () => {
    const driveHandle = await proxy.write.drives.create({
      global: { name: "RPC drive" },
    });
    const drive = await driveHandle.document<DocumentDriveDocument>();

    const folder = await proxy.write.drives.addFolder(drive.header.id, "inbox");
    const updated = await folder.document<DocumentDriveDocument>();

    expect(folder.nodeId).toBeTruthy();
    expect(
      updated.state.global.nodes.some((node) => node.id === folder.nodeId),
    ).toBe(true);
    const nodes = await proxy.read.drives.listNodes(drive.header.id);
    expect(nodes.results.map((node) => node.id)).toContain(folder.nodeId);
  });

  it("rebuilds a batch handle per key", async () => {
    const created = await proxy.createEmpty<DocumentDriveDocument>(DRIVE_TYPE);

    const batch = await proxy.write.executeBatch({
      jobs: [
        {
          key: "rename",
          documentId: created.header.id,
          scope: "global",
          branch: "main",
          actions: [actions.setName("batched")],
          dependsOn: [],
        },
      ],
    });
    const receipts = await batch.readable;

    expect(receipts.rename.job.status).toBe(JobStatus.READ_READY);
    expect(batch.handles.rename.jobId).toBe(batch.jobs.rename.id);
    const renamed = await batch.handles.rename.document();
    expect(renamed.header.name).toBe("batched");
  });

  it("still serves the facade's own methods", async () => {
    const created = await proxy.createEmpty<DocumentDriveDocument>(DRIVE_TYPE);
    const renamed = await proxy.rename(created.header.id, "facade");
    expect(renamed.header.name).toBe("facade");
  });

  it("refuses a path that names no method of a half", async () => {
    const unknown = (proxy.read as unknown as Record<string, () => unknown>)
      .noSuchMethod;
    await expect(unknown()).rejects.toThrow(
      "Unknown reactor method: read.noSuchMethod",
    );
  });
});
