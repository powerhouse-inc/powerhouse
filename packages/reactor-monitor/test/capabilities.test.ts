import { PGlite } from "@electric-sql/pglite";
import {
  ChannelScheme,
  GQL_CHANNEL_TYPE,
  LOCAL_CHANNEL_TYPE,
  POLLING_CHANNEL_TYPE,
} from "@powerhousedao/reactor";
import { describe, expect, it } from "vitest";
import {
  buildMonitorReactor,
  isLocalOnlySync,
  provisionInProcess,
  reactorCapabilities,
  supportsSyncChannel,
  unverifiedReactorCapabilities,
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

  // W3.0: a gql-scheme reactor composes a LocalChannelFactory onto its scheme,
  // so it serves Switchboard remotes AND brokered local peers. This row is
  // what tells a router that a connected reactor may still be linked to a
  // sibling, which is the whole point of the mixed topologies in stage 3.
  it("reads both channels for a gql-scheme reactor and none for a sync-less one", () => {
    expect(
      reactorCapabilities({ kind: "in-process", name: "cap-default" })
        .syncChannels,
    ).toEqual([GQL_CHANNEL_TYPE, LOCAL_CHANNEL_TYPE]);
    expect(
      reactorCapabilities({
        kind: "worker",
        name: "cap-connect",
        sync: { channelScheme: ChannelScheme.CONNECT },
      }).syncChannels,
    ).toEqual([GQL_CHANNEL_TYPE, LOCAL_CHANNEL_TYPE]);
    // No sync module at all: an island, linkable by nothing.
    expect(
      reactorCapabilities({
        kind: "in-process",
        name: "cap-island",
        sync: { channelScheme: null },
      }).syncChannels,
    ).toEqual([]);
  });

  // The SWITCHBOARD row, and the reason this contract carries the LITERAL
  // channel types: that scheme's factory serves "polling" channels, which come
  // into being when a peer registers one against this reactor, not when a
  // holder adds one. Labelling it "gql" would have told the monitor's
  // add-remote form it could create a `{type:"gql"}` remote here -- a config
  // the GqlResponseChannelFactory refuses -- so the form reads the absence of
  // "gql" and stays hidden instead.
  it("names the switchboard scheme's own polling channel, not an abstract gql one", () => {
    const capabilities = reactorCapabilities({
      kind: "in-process",
      name: "cap-switchboard",
      sync: { channelScheme: ChannelScheme.SWITCHBOARD },
    });

    expect(capabilities.syncChannels).toEqual([
      POLLING_CHANNEL_TYPE,
      LOCAL_CHANNEL_TYPE,
    ]);
    expect(supportsSyncChannel(capabilities, GQL_CHANNEL_TYPE)).toBe(false);
    expect(supportsSyncChannel(capabilities, LOCAL_CHANNEL_TYPE)).toBe(true);
  });

  // The structural rule: syncChannels states what the reactor ROUTES, which
  // only the built factory knows. A descriptor saying otherwise loses.
  it("reads the built channel types over anything the descriptor asked for", () => {
    const asked: ReactorDescriptor = {
      kind: "worker",
      name: "cap-built-wins",
      sync: { channelScheme: ChannelScheme.CONNECT },
    };

    expect(
      reactorCapabilities(asked, {
        canSelfHeal: true,
        syncChannelTypes: [LOCAL_CHANNEL_TYPE],
      }).syncChannels,
    ).toEqual([LOCAL_CHANNEL_TYPE]);
    // And the reverse: a local-ONLY request on a worker that actually built a
    // composite declares the composite's types.
    expect(
      reactorCapabilities(
        { kind: "worker", name: "cap-built-wins-2", sync: { local: true } },
        {
          canSelfHeal: true,
          syncChannelTypes: [GQL_CHANNEL_TYPE, LOCAL_CHANNEL_TYPE],
        },
      ).syncChannels,
    ).toEqual([GQL_CHANNEL_TYPE, LOCAL_CHANNEL_TYPE]);
  });

  // A transport this contract has no row for cannot be routed on by a router
  // that was never taught it, so it is dropped rather than widening the type.
  it("drops a reported channel type the contract has no row for", () => {
    expect(
      reactorCapabilities(
        { kind: "worker", name: "cap-unknown-type" },
        {
          canSelfHeal: false,
          syncChannelTypes: ["carrier-pigeon", LOCAL_CHANNEL_TYPE],
        },
      ).syncChannels,
    ).toEqual([LOCAL_CHANNEL_TYPE]);
  });

  // Never claim `local` on a guess: claiming it puts the adopt/remove handles
  // on the reactor and lets linkLocalSync open and TRANSFER a port before
  // finding out, where refusing only costs a re-provision.
  it("claims no local channel for a reactor whose built facts could not be read", () => {
    expect(
      unverifiedReactorCapabilities({
        kind: "worker",
        name: "cap-unverified-connect",
      }).syncChannels,
    ).toEqual([GQL_CHANNEL_TYPE]);
    expect(
      unverifiedReactorCapabilities({
        kind: "worker",
        name: "cap-unverified-local",
        sync: { local: true },
      }).syncChannels,
    ).toEqual([]);
    // Everything else still reads as the descriptor's own approximation.
    expect(
      unverifiedReactorCapabilities({
        kind: "worker",
        name: "cap-unverified-memory",
        storage: { kind: "memory" },
      }),
    ).toMatchObject({
      storage: { kind: "memory", durable: false },
      selfHeal: false,
      inspection: "rpc",
    });
  });

  it("lets sync.local win over a channelScheme, exactly as the builder does", () => {
    // buildMonitorReactor still ignores channelScheme when localSync is set:
    // that mode means local-ONLY, with no gql factory at all.
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

  it("keeps a caller-supplied pg unhealable, threading BuiltReactor.canSelfHeal rather than re-deriving it", async () => {
    const pg = new PGlite();
    await pg.waitReady;
    const built = await buildMonitorReactor({ namespace: "cap-caller-pg", pg });
    try {
      // The other built fact, from the same reactor: the default scheme
      // composes a local factory onto its gql one, and the composite reports
      // both types rather than the builder's branches being re-run here.
      expect(built.syncChannelTypes).toEqual([
        GQL_CHANNEL_TYPE,
        LOCAL_CHANNEL_TYPE,
      ]);
      // A caller-supplied `pg` is the caller's to reopen, not this process's
      // -- build-reactor.ts never constructs self-heal for it (ownsStore is
      // false), independent of what storage kind a descriptor would
      // otherwise claim.
      expect(built.canSelfHeal).toBe(false);

      const capabilities = reactorCapabilities(
        {
          kind: "in-process",
          name: "cap-caller-pg",
          storage: { kind: "idb" },
        },
        {
          canSelfHeal: built.canSelfHeal,
          syncChannelTypes: built.syncChannelTypes,
        },
      );
      // Storage still reads durable -- that is what the descriptor claims --
      // but selfHeal must come from the actual built fact, not be re-derived
      // from that durability alone, or it would (incorrectly) read true.
      expect(capabilities.storage).toEqual({ kind: "idb", durable: true });
      expect(capabilities.selfHeal).toBe(false);
    } finally {
      await built.shutdown();
      await pg.close();
    }
  }, 60_000);

  it("answers channel support through the one contract reader", () => {
    const local = reactorCapabilities({
      kind: "in-process",
      name: "cap-local",
      sync: { local: true },
    });
    expect(supportsSyncChannel(local, LOCAL_CHANNEL_TYPE)).toBe(true);
    expect(supportsSyncChannel(local, GQL_CHANNEL_TYPE)).toBe(false);

    const connect = reactorCapabilities({
      kind: "in-process",
      name: "cap-connect-reader",
      sync: { channelScheme: ChannelScheme.CONNECT },
    });
    expect(supportsSyncChannel(connect, LOCAL_CHANNEL_TYPE)).toBe(true);
    expect(supportsSyncChannel(connect, GQL_CHANNEL_TYPE)).toBe(true);

    const island = reactorCapabilities({
      kind: "in-process",
      name: "cap-island-reader",
      sync: { channelScheme: null },
    });
    expect(supportsSyncChannel(island, LOCAL_CHANNEL_TYPE)).toBe(false);
    expect(supportsSyncChannel(island, GQL_CHANNEL_TYPE)).toBe(false);
  });
});

/**
 * The one read of the local-ONLY mode, shared by the builder and this
 * contract. Two readers each spelling their own truthiness test is how what a
 * reactor is BUILT as and what it DECLARES drift apart.
 */
describe("isLocalOnlySync", () => {
  it("selects local-only on the boolean true and nothing else", () => {
    expect(isLocalOnlySync(true)).toBe(true);
    expect(isLocalOnlySync(false)).toBe(false);
    expect(isLocalOnlySync(undefined)).toBe(false);
  });

  it("refuses an untyped value instead of reading it as truthy", () => {
    for (const value of ["true", "", 1, 0, {}, null]) {
      expect(() => isLocalOnlySync(value)).toThrow(/local must be a boolean/);
    }
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
