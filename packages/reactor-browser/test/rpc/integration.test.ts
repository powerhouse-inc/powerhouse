import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createReactorClientProxy } from "../../src/rpc/client-proxy.js";
import { ReactorHostServer } from "../../src/rpc/host-server.js";
import { createPortTransport } from "../../src/rpc/transport.js";
import {
  createInMemoryReactorClient,
  type InMemoryReactor,
} from "./reactor-fixture.js";

const DRIVE_TYPE = "powerhouse/document-drive";

describe("RPC proxy against a real in-memory reactor", () => {
  let reactor: InMemoryReactor;
  let channel: MessageChannel;
  let host: ReactorHostServer;
  let proxy: ReturnType<typeof createReactorClientProxy>;

  beforeEach(async () => {
    reactor = await createInMemoryReactorClient();
    channel = new MessageChannel();
    host = new ReactorHostServer(
      reactor.client,
      createPortTransport(channel.port1),
    );
    host.start();
    proxy = createReactorClientProxy(createPortTransport(channel.port2));
  });

  afterEach(async () => {
    host.stop();
    channel.port1.close();
    channel.port2.close();
    await reactor.dispose();
  });

  it("creates a document and reads it back over the boundary", async () => {
    const created = await proxy.createEmpty(DRIVE_TYPE);
    expect(created.header.id).toBeTruthy();
    const fetched = await proxy.get(created.header.id);
    expect(fetched.header.id).toBe(created.header.id);
  });

  it("lists documents via find (PagedResults across the boundary)", async () => {
    const created = await proxy.createEmpty(DRIVE_TYPE);
    const page = await proxy.find({ type: DRIVE_TYPE });
    const ids = page.results.map((doc) => doc.header.id);
    expect(ids).toContain(created.header.id);
  });

  it("delivers a subscription event for a new document", async () => {
    const seen = new Set<string>();
    let resolveSeen: () => void;
    const sawEvent = new Promise<void>((resolve) => {
      resolveSeen = resolve;
    });
    proxy.subscribe({ type: DRIVE_TYPE }, (event) => {
      for (const doc of event.documents) {
        seen.add(doc.header.id);
      }
      resolveSeen();
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const created = await proxy.createEmpty(DRIVE_TYPE);
    await sawEvent;
    expect(seen.has(created.header.id)).toBe(true);
  });
});
