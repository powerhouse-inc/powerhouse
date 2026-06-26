import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createReactorClientProxy } from "../../src/rpc/client-proxy.js";
import { MessageRouter } from "../../src/rpc/message-router.js";
import { ReactorHost } from "../../src/rpc/reactor-host.js";
import { createPortTransport } from "../../src/rpc/transport.js";

function tabRouter(port: MessagePort): MessageRouter {
  const router = new MessageRouter();
  router.attach(createPortTransport(port));
  return router;
}
import {
  createInMemoryReactorClient,
  type InMemoryReactor,
} from "./reactor-fixture.js";

const DRIVE_TYPE = "powerhouse/document-drive";

describe("ReactorHost shares one reactor across multiple tabs", () => {
  let reactor: InMemoryReactor;
  let host: ReactorHost;
  const channels: MessageChannel[] = [];
  const disposers: Array<() => void> = [];

  function connectTab() {
    const channel = new MessageChannel();
    channels.push(channel);
    disposers.push(host.connect(createPortTransport(channel.port1)));
    return createReactorClientProxy(tabRouter(channel.port2));
  }

  beforeEach(async () => {
    reactor = await createInMemoryReactorClient();
    host = new ReactorHost({ client: reactor.client });
  });

  afterEach(async () => {
    for (const dispose of disposers) dispose();
    disposers.length = 0;
    for (const channel of channels) {
      channel.port1.close();
      channel.port2.close();
    }
    channels.length = 0;
    await reactor.dispose();
  });

  it("makes a write in one tab visible in another", async () => {
    const tabA = connectTab();
    const tabB = connectTab();
    const created = await tabA.createEmpty(DRIVE_TYPE);
    const fetched = await tabB.get(created.header.id);
    expect(fetched.header.id).toBe(created.header.id);
  });

  it("fans out subscription events to a different tab", async () => {
    const tabA = connectTab();
    const tabB = connectTab();
    const seenByB = new Set<string>();
    let resolveB: () => void;
    const bSawEvent = new Promise<void>((resolve) => {
      resolveB = resolve;
    });
    tabB.subscribe({ type: DRIVE_TYPE }, (event) => {
      for (const doc of event.documents) {
        seenByB.add(doc.header.id);
      }
      resolveB();
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const created = await tabA.createEmpty(DRIVE_TYPE);
    await bSawEvent;
    expect(seenByB.has(created.header.id)).toBe(true);
  });

  it("tracks and releases connections", () => {
    expect(host.connectionCount).toBe(0);
    connectTab();
    connectTab();
    expect(host.connectionCount).toBe(2);
    disposers.pop()?.();
    expect(host.connectionCount).toBe(1);
  });
});
