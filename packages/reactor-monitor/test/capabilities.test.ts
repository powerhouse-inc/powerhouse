import { ChannelScheme } from "@powerhousedao/reactor";
import { describe, expect, it } from "vitest";
import {
  provisionInProcess,
  reactorCapabilities,
  supportsSyncChannel,
  type ReactorCapabilities,
  type ReactorDescriptor,
} from "../src/index.js";
import { descriptor } from "./helpers.js";

/**
 * The stage-2 capability contract (docs/plans/2026-10-03-multi-reactor.md):
 * capability variance between hosting kinds is an explicit, typed, queryable
 * property, and these assertions are the contract's text. A change here is a
 * change to what the future router routes on.
 */
describe("reactorCapabilities", () => {
  it("describes an in-process local-sync reactor on durable idb storage", () => {
    const capabilities = reactorCapabilities({
      kind: "in-process",
      name: "cap-in-process",
      sync: { local: true },
    });

    expect(capabilities).toEqual({
      hosting: "in-process",
      storage: { kind: "idb", durable: true },
      processors: true,
      workflows: false,
      inspection: "direct",
      syncChannels: ["local"],
      selfHeal: true,
    } satisfies ReactorCapabilities);
  });

  it("describes a worker local-sync reactor, differing only where the realm forces it", () => {
    const capabilities = reactorCapabilities({
      kind: "worker",
      name: "cap-worker",
      sync: { local: true },
    });

    expect(capabilities).toEqual({
      hosting: "worker",
      storage: { kind: "idb", durable: true },
      // A processor factory is a function and does not survive postMessage --
      // Connect's live limitation (plan backlog item 2).
      processors: false,
      workflows: false,
      inspection: "rpc",
      syncChannels: ["local"],
      selfHeal: true,
    } satisfies ReactorCapabilities);
  });

  it("is the SAME except for the three realm-forced fields across hosting kinds", () => {
    const worker = reactorCapabilities({
      kind: "worker",
      name: "same-worker",
      sync: { local: true },
    });
    const inProcess = reactorCapabilities({
      kind: "in-process",
      name: "same-in-process",
      sync: { local: true },
    });

    const differing = (Object.keys(worker) as Array<keyof ReactorCapabilities>)
      .filter(
        (key) => JSON.stringify(worker[key]) !== JSON.stringify(inProcess[key]),
      )
      .sort();
    expect(differing).toEqual(["hosting", "inspection", "processors"]);
  });

  it("reads gql sync channels for a connect-mode reactor and none for a sync-less one", () => {
    expect(
      reactorCapabilities({ kind: "in-process", name: "cap-default" })
        .syncChannels,
    ).toEqual(["gql"]);
    expect(
      reactorCapabilities({
        kind: "worker",
        name: "cap-connect",
        sync: { channelScheme: ChannelScheme.CONNECT },
      }).syncChannels,
    ).toEqual(["gql"]);
    expect(
      reactorCapabilities({
        kind: "in-process",
        name: "cap-switchboard",
        sync: { channelScheme: ChannelScheme.SWITCHBOARD },
      }).syncChannels,
    ).toEqual(["gql"]);
    // No sync module at all: an island, linkable by nothing.
    expect(
      reactorCapabilities({
        kind: "in-process",
        name: "cap-island",
        sync: { channelScheme: null },
      }).syncChannels,
    ).toEqual([]);
  });

  it("lets sync.local win over a channelScheme, exactly as the builder does", () => {
    // buildMonitorReactor ignores channelScheme when localSync is set: one
    // reactor wires one channel factory.
    expect(
      reactorCapabilities({
        kind: "worker",
        name: "cap-both",
        sync: { local: true, channelScheme: ChannelScheme.CONNECT },
      }).syncChannels,
    ).toEqual(["local"]);
  });

  it("marks a memory store ephemeral and therefore unhealable", () => {
    const capabilities = reactorCapabilities({
      kind: "in-process",
      name: "cap-memory",
      storage: { kind: "memory" },
    });
    expect(capabilities.storage).toEqual({ kind: "memory", durable: false });
    expect(capabilities.selfHeal).toBe(false);
  });

  it("marks a node data directory durable and healable", () => {
    const capabilities = reactorCapabilities({
      kind: "in-process",
      name: "cap-path",
      storage: { kind: "path", dataDir: "/tmp/cap-path" },
    });
    expect(capabilities.storage).toEqual({ kind: "path", durable: true });
    expect(capabilities.selfHeal).toBe(true);
  });

  it("states today's truth for the not-yet-provisionable remote kind", () => {
    const capabilities = reactorCapabilities({
      kind: "remote",
      name: "cap-remote",
    });
    expect(capabilities).toEqual({
      hosting: "remote",
      // The far side owns the store; it is not ours to open, close or heal.
      storage: { kind: "remote", durable: true },
      processors: true,
      workflows: true,
      // W3.2 serves IInspector over HTTP/GraphQL and raises this to "rpc".
      inspection: "none",
      syncChannels: ["gql"],
      selfHeal: false,
    } satisfies ReactorCapabilities);
  });

  it("is frozen, so a holder cannot edit another holder's contract", () => {
    const capabilities = reactorCapabilities({
      kind: "in-process",
      name: "cap-frozen",
    });
    expect(Object.isFrozen(capabilities)).toBe(true);
    expect(Object.isFrozen(capabilities.storage)).toBe(true);
    expect(Object.isFrozen(capabilities.syncChannels)).toBe(true);
  });

  it("answers channel support through the one contract reader", () => {
    const local = reactorCapabilities({
      kind: "in-process",
      name: "cap-local",
      sync: { local: true },
    });
    expect(supportsSyncChannel(local, "local")).toBe(true);
    expect(supportsSyncChannel(local, "gql")).toBe(false);
  });
});

describe("ManagedReactor.capabilities", () => {
  it("is on the provisioned handle and matches the descriptor's derivation", async () => {
    const spec: ReactorDescriptor = descriptor("cap-provisioned", {
      sync: { local: true },
    });
    const reactor = await provisionInProcess(spec);
    try {
      expect(reactor.capabilities).toEqual(reactorCapabilities(spec));
      // The handle's capabilities are what the link guard reads, so the two
      // facts the suite relies on are asserted against the live reactor.
      expect(reactor.capabilities.syncChannels).toEqual(["local"]);
      expect(reactor.capabilities.inspection).toBe("direct");
      // Memory storage (the test default) really is reported undurable.
      expect(reactor.capabilities.storage).toEqual({
        kind: "memory",
        durable: false,
      });
      expect(reactor.capabilities.selfHeal).toBe(false);
    } finally {
      await reactor.kill();
    }
  }, 60_000);
});
