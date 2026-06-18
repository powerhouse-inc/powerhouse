import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { connectReactorClient } from "../../src/rpc/connect-reactor.js";
import type { VersionFingerprint } from "../../src/rpc/protocol.js";
import { ReactorHost } from "../../src/rpc/reactor-host.js";
import { createPortTransport } from "../../src/rpc/transport.js";
import {
  createInMemoryReactorClient,
  type InMemoryReactor,
} from "./reactor-fixture.js";

const DRIVE_TYPE = "powerhouse/document-drive";
const V1: VersionFingerprint = {
  appBuildId: "b1",
  rpcProtocolVersion: 1,
  models: [],
};
const V2: VersionFingerprint = {
  appBuildId: "b2",
  rpcProtocolVersion: 1,
  models: [],
};

describe("connectReactorClient", () => {
  let reactor: InMemoryReactor;
  let host: ReactorHost;
  const channels: MessageChannel[] = [];
  const disposers: Array<() => void> = [];

  function tab(
    version: VersionFingerprint = V1,
    onReload?: (reason: string) => void,
  ) {
    const channel = new MessageChannel();
    channels.push(channel);
    disposers.push(host.connect(createPortTransport(channel.port1)));
    return connectReactorClient(
      createPortTransport(channel.port2),
      { version, construct: {} },
      onReload,
    );
  }

  beforeEach(async () => {
    reactor = await createInMemoryReactorClient();
    host = new ReactorHost({ build: () => Promise.resolve(reactor.client) });
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

  it("connects and round-trips after the lazy build (requests buffer until ready)", async () => {
    const client = tab();
    const created = await client.createEmpty(DRIVE_TYPE);
    expect(created.header.id).toBeTruthy();
  });

  it("invokes onReload when the owner rejects an incompatible version", async () => {
    tab(V1);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const reason = await new Promise<string>((resolve) => {
      tab(V2, resolve);
    });
    expect(reason).toBe("reactor version mismatch");
  });
});
