import {
  DriveCollectionId,
  LOCAL_CHANNEL_TYPE,
  type ISyncManager,
  type LocalChannelPort,
  type Remote,
} from "@powerhousedao/reactor";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_LOCAL_FILTER,
  localChannelConfig,
  registerLocalPeer,
} from "../src/sync/adopt-sync-peer.js";
import { LocalChannelPortRegistry } from "../src/sync/local-channel-registry.js";

function fakePort(): LocalChannelPort {
  return {
    postMessage: vi.fn(),
    onMessage: vi.fn(() => () => {}),
    close: vi.fn(),
  };
}

function fakeSyncManager(): ISyncManager & { add: ReturnType<typeof vi.fn> } {
  const add = vi.fn((name: string): Promise<Remote> =>
    Promise.resolve({
      meta: { name },
    } as unknown as Remote),
  );
  return { add } as unknown as ISyncManager & {
    add: ReturnType<typeof vi.fn>;
  };
}

describe("registerLocalPeer (adopt-sync-peer handler core)", () => {
  it("registers the port under (peerId, channelName) and adds the local remote", async () => {
    const registry = new LocalChannelPortRegistry();
    const syncManager = fakeSyncManager();
    const port = fakePort();
    const collectionId = DriveCollectionId.forDrive("drive-1");

    const remote = await registerLocalPeer(
      syncManager,
      registry,
      {
        peerId: "peer-b",
        channelName: "chan-1",
        collectionId,
        remoteName: "local:peer-b:chan-1",
        filter: DEFAULT_LOCAL_FILTER,
      },
      port,
    );

    // The factory's transport provider resolves exactly the registered port.
    expect(registry.provider("peer-b", "chan-1")).toBe(port);
    expect(registry.has("peer-b", "chan-1")).toBe(true);

    // The remote was added with the local channel config the factory keys on.
    expect(syncManager.add).toHaveBeenCalledWith(
      "local:peer-b:chan-1",
      collectionId,
      {
        type: LOCAL_CHANNEL_TYPE,
        parameters: { peerId: "peer-b", channelName: "chan-1" },
      },
      DEFAULT_LOCAL_FILTER,
    );
    expect(remote.meta.name).toBe("local:peer-b:chan-1");
  });

  it("builds a local channel config the LocalChannelFactory can resolve", () => {
    expect(localChannelConfig("b", "c")).toEqual({
      type: LOCAL_CHANNEL_TYPE,
      parameters: { peerId: "b", channelName: "c" },
    });
  });

  it("keys ports by both peer and channel so distinct links do not collide", () => {
    const registry = new LocalChannelPortRegistry();
    const first = fakePort();
    const second = fakePort();

    registry.register("peer-b", "drive-1", first);
    registry.register("peer-b", "drive-2", second);

    expect(registry.provider("peer-b", "drive-1")).toBe(first);
    expect(registry.provider("peer-b", "drive-2")).toBe(second);

    registry.unregister("peer-b", "drive-1");
    expect(registry.provider("peer-b", "drive-1")).toBeUndefined();
    expect(registry.provider("peer-b", "drive-2")).toBe(second);
  });
});
