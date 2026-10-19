import { describe, expect, it, vi } from "vitest";
import { DriveCollectionId } from "../../../../src/cache/operation-index-types.js";
import type { IOperationIndex } from "../../../../src/cache/operation-index-types.js";
import type { ISyncCursorStorage } from "../../../../src/storage/interfaces.js";
import { CompositeChannelFactory } from "../../../../src/sync/channels/composite-channel-factory.js";
import {
  GQL_CHANNEL_TYPE,
  GqlRequestChannelFactory,
} from "../../../../src/sync/channels/gql-request-channel-factory.js";
import {
  GqlResponseChannelFactory,
  POLLING_CHANNEL_TYPE,
} from "../../../../src/sync/channels/gql-response-channel-factory.js";
import {
  LOCAL_CHANNEL_TYPE,
  LocalChannelFactory,
} from "../../../../src/sync/channels/local-channel-factory.js";
import { createMockLogger, createTestQueue } from "../../../factories.js";
import type {
  IChannel,
  IChannelFactory,
} from "../../../../src/sync/interfaces.js";
import { PollBehavior } from "../../../../src/sync/types.js";
import type {
  ChannelConfig,
  RemoteFilter,
  RemoteOptions,
} from "../../../../src/sync/types.js";
import { TestChannel } from "../test-channel.js";

const FILTER: RemoteFilter = { documentId: [], scope: [], branch: "main" };
const COLLECTION = DriveCollectionId.forDrive("drive-1");
const CURSORS = {} as ISyncCursorStorage;
const INDEX = {} as IOperationIndex;

/**
 * A factory that records every call and returns a distinguishable channel.
 *
 * The channel is a real `TestChannel` rather than a labelled stand-in: the
 * composite forwards whatever its delegate returns and touches nothing on it,
 * so the assertions are on identity, and a fake missing half of `IChannel`
 * would only hide the day the composite starts reading one.
 */
class RecordingFactory implements IChannelFactory {
  readonly calls: unknown[][] = [];
  readonly channel: IChannel;

  constructor(readonly label: string) {
    this.channel = new TestChannel(label, label, CURSORS, () => {});
  }

  instance(
    remoteId: string,
    remoteName: string,
    config: ChannelConfig,
    cursorStorage: ISyncCursorStorage,
    collectionId: DriveCollectionId,
    filter: RemoteFilter,
    operationIndex: IOperationIndex,
    options?: RemoteOptions,
  ): IChannel {
    this.calls.push([
      remoteId,
      remoteName,
      config,
      cursorStorage,
      collectionId,
      filter,
      operationIndex,
      options,
    ]);
    return this.channel;
  }
}

function build(
  factory: CompositeChannelFactory,
  type: string,
  options?: RemoteOptions,
): IChannel {
  return factory.instance(
    "remote-id",
    "remote-name",
    { type, parameters: {} },
    CURSORS,
    COLLECTION,
    FILTER,
    INDEX,
    options,
  );
}

describe("CompositeChannelFactory", () => {
  it("routes each config to the factory registered for its type", () => {
    const gql = new RecordingFactory("gql");
    const local = new RecordingFactory("local");
    const composite = new CompositeChannelFactory([
      [GQL_CHANNEL_TYPE, gql],
      [LOCAL_CHANNEL_TYPE, local],
    ]);

    expect(build(composite, GQL_CHANNEL_TYPE)).toBe(gql.channel);
    expect(build(composite, LOCAL_CHANNEL_TYPE)).toBe(local.channel);
    expect(gql.calls).toHaveLength(1);
    expect(local.calls).toHaveLength(1);
  });

  it("passes every argument through untouched", () => {
    const local = new RecordingFactory("local");
    const composite = new CompositeChannelFactory([
      [LOCAL_CHANNEL_TYPE, local],
    ]);
    const options: RemoteOptions = { pollBehavior: PollBehavior.Manual };

    build(composite, LOCAL_CHANNEL_TYPE, options);

    expect(local.calls[0]).toEqual([
      "remote-id",
      "remote-name",
      { type: LOCAL_CHANNEL_TYPE, parameters: {} },
      CURSORS,
      COLLECTION,
      FILTER,
      INDEX,
      options,
    ]);
  });

  // The single-factory world answered an unroutable config with whatever the
  // one factory complained about -- a gql factory asked for a `url` when
  // handed a local config. The composite must name the actual problem.
  it("refuses an unknown type by naming the types it does serve", () => {
    const composite = new CompositeChannelFactory([
      [GQL_CHANNEL_TYPE, new RecordingFactory("gql")],
      [LOCAL_CHANNEL_TYPE, new RecordingFactory("local")],
    ]);

    expect(() => build(composite, "carrier-pigeon")).toThrow(
      'This reactor has no "carrier-pigeon" channel factory: it composes factories for [gql, local]',
    );
  });

  it("reports its registered types in registration order", () => {
    const composite = new CompositeChannelFactory([
      [LOCAL_CHANNEL_TYPE, new RecordingFactory("local")],
      [GQL_CHANNEL_TYPE, new RecordingFactory("gql")],
    ]);

    expect(composite.channelTypes).toEqual([
      LOCAL_CHANNEL_TYPE,
      GQL_CHANNEL_TYPE,
    ]);
  });

  it("refuses two factories for one type rather than picking one", () => {
    expect(
      () =>
        new CompositeChannelFactory([
          [GQL_CHANNEL_TYPE, new RecordingFactory("first")],
          [GQL_CHANNEL_TYPE, new RecordingFactory("second")],
        ]),
    ).toThrow(
      'CompositeChannelFactory was given two factories for the channel type "gql"',
    );
  });

  it("refuses a factory registered under a type it says it does not build", () => {
    const local = new LocalChannelFactory(createMockLogger(), () => undefined);

    expect(
      () => new CompositeChannelFactory([[GQL_CHANNEL_TYPE, local]]),
    ).toThrow(
      'CompositeChannelFactory was given a factory for "gql" that builds only [local]',
    );
  });

  it("reads the shipped factories' declared types", () => {
    const logger = createMockLogger();
    expect(
      new GqlRequestChannelFactory(logger, undefined, createTestQueue())
        .channelTypes,
    ).toEqual([GQL_CHANNEL_TYPE]);
    expect(new GqlResponseChannelFactory(logger).channelTypes).toEqual([
      POLLING_CHANNEL_TYPE,
    ]);
    expect(
      new LocalChannelFactory(logger, () => undefined).channelTypes,
    ).toEqual([LOCAL_CHANNEL_TYPE]);
  });

  it("refuses an empty registration", () => {
    expect(() => new CompositeChannelFactory([])).toThrow(
      "CompositeChannelFactory requires at least one (type, factory) entry",
    );
  });

  it("does not consult any factory for an unknown type", () => {
    const gql = new RecordingFactory("gql");
    const spy = vi.spyOn(gql, "instance");
    const composite = new CompositeChannelFactory([[GQL_CHANNEL_TYPE, gql]]);

    expect(() => build(composite, LOCAL_CHANNEL_TYPE)).toThrow();
    expect(spy).not.toHaveBeenCalled();
  });
});
