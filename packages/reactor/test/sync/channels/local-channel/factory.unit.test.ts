import { describe, expect, it, vi } from "vitest";
import { DriveCollectionId } from "../../../../src/cache/operation-index-types.js";
import type { IOperationIndex } from "../../../../src/cache/operation-index-types.js";
import type { ISyncCursorStorage } from "../../../../src/storage/interfaces.js";
import {
  LOCAL_CHANNEL_TYPE,
  LocalChannelFactory,
} from "../../../../src/sync/channels/local-channel-factory.js";
import type { LocalChannelPort } from "../../../../src/sync/channels/local-channel-transport.js";
import { createMockLogger } from "../../../factories.js";

const FILTER = { documentId: [], scope: [], branch: "" };
const COLLECTION = DriveCollectionId.forDrive("drive-1");

function fakePort(): LocalChannelPort {
  return {
    postMessage: vi.fn(),
    onMessage: vi.fn(() => () => {}),
    close: vi.fn(),
  };
}

function factoryWith(port: LocalChannelPort | undefined): LocalChannelFactory {
  return new LocalChannelFactory(createMockLogger(), () => port);
}

function build(
  factory: LocalChannelFactory,
  type: string,
  parameters: Record<string, unknown>,
): unknown {
  return factory.instance(
    "remote-id",
    "remote-name",
    { type, parameters },
    {} as ISyncCursorStorage,
    COLLECTION,
    FILTER,
    {} as IOperationIndex,
  );
}

describe("LocalChannelFactory", () => {
  it("builds a channel for a local config whose port is registered", () => {
    const factory = factoryWith(fakePort());

    expect(
      build(factory, LOCAL_CHANNEL_TYPE, {
        peerId: "peer-b",
        channelName: "chan-1",
      }),
    ).toBeDefined();
  });

  // A reactor provisioned local-only wires ONE channel factory, so a gql config
  // reaches this one. It must say that rather than complain about peerId.
  it("rejects a non-local channel config by naming the missing factory", () => {
    const factory = factoryWith(fakePort());

    expect(() =>
      build(factory, "gql", { url: "https://example.test/graphql" }),
    ).toThrow('This reactor has no "gql" channel factory');
  });

  it("rejects a local config with no registered transport", () => {
    const factory = factoryWith(undefined);

    expect(() =>
      build(factory, LOCAL_CHANNEL_TYPE, {
        peerId: "peer-b",
        channelName: "chan-1",
      }),
    ).toThrow(
      "LocalChannelFactory has no transport for peer 'peer-b' channel 'chan-1'",
    );
  });

  it("rejects a local config missing its registry key", () => {
    const factory = factoryWith(fakePort());

    expect(() => build(factory, LOCAL_CHANNEL_TYPE, {})).toThrow(
      'LocalChannelFactory requires a non-empty "peerId" string',
    );
  });
});
