import {
  localPeerManifest,
  PEER_CAPABILITIES,
  type PeerCapability,
  type PeerManifest,
} from "@powerhousedao/shared/document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GqlRequestChannel } from "../../../../src/sync/channels/gql-req-channel.js";
import {
  ManualPollTimer,
  createMockCursorStorage,
  createMockLogger,
  createMockOperationIndex,
  createTestConfig,
} from "./test-helpers.js";

const TEST_PROTOCOL: PeerCapability = {
  kind: "protocol",
  name: "test-protocol",
  baseline: [1],
  supported: (flags) => (flags.wide ? [1, 2] : [1]),
  optional: true,
};

const LOCAL = localPeerManifest(PEER_CAPABILITIES, {});
const SERVER_NARROW = localPeerManifest([TEST_PROTOCOL], {});
const SERVER_WIDE = localPeerManifest([TEST_PROTOCOL], { wide: true });

type Body = {
  query: string;
  variables: { input?: Record<string, unknown> };
};

/** A server with peer agreement, holding what the client last touched with. */
function agreementServer(initial: PeerManifest) {
  const state = {
    server: initial,
    held: null as PeerManifest | null,
    touches: [] as Body[],
    polls: [] as Body[],
  };
  const fetchFn = vi
    .fn()
    .mockImplementation((_url: string, options: RequestInit) => {
      const body = JSON.parse(options.body as string) as Body;
      if (body.query.includes("touchChannel")) {
        state.touches.push(body);
        state.held = (body.variables.input?.manifest as PeerManifest) ?? null;
        return respond({
          touchChannel: {
            success: true,
            ackOrdinal: 0,
            manifest: state.server,
          },
        });
      }
      state.polls.push(body);
      return respond({
        pollSyncEnvelopes: {
          envelopes: [],
          ackOrdinal: 0,
          deadLetters: [],
          hasMore: false,
          manifestRevision: state.server.revision,
          peerManifestRevision: state.held?.revision ?? null,
        },
      });
    });
  return { state, fetchFn };
}

/** A server on the schema before peer agreement: validation rejects the fields. */
function previousSchemaServer() {
  const touches: Body[] = [];
  const polls: Body[] = [];
  const fetchFn = vi
    .fn()
    .mockImplementation((_url: string, options: RequestInit) => {
      const body = JSON.parse(options.body as string) as Body;
      const unknown = ["manifestRevision", "peerManifestRevision", "manifest"];
      const named =
        unknown.find((field) => body.query.includes(field)) ??
        (body.variables.input && "manifest" in body.variables.input
          ? "manifest"
          : undefined);
      if (body.query.includes("touchChannel")) {
        touches.push(body);
      } else {
        polls.push(body);
      }
      if (named) {
        return respond(undefined, [
          {
            message: `Field "${named}" is not defined by type "TouchChannelInput".`,
            extensions: { code: "GRAPHQL_VALIDATION_FAILED" },
          },
        ]);
      }
      if (body.query.includes("touchChannel")) {
        return respond({ touchChannel: { success: true, ackOrdinal: 0 } });
      }
      return respond({
        pollSyncEnvelopes: {
          envelopes: [],
          ackOrdinal: 0,
          deadLetters: [],
          hasMore: false,
        },
      });
    });
  return { fetchFn, touches, polls };
}

function respond(data: unknown, errors?: unknown[]) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(errors ? { errors } : { data }),
  });
}

function channelWith(
  fetchFn: ReturnType<typeof vi.fn>,
  timer: ManualPollTimer,
) {
  const channel = new GqlRequestChannel(
    createMockLogger(),
    "channel-1",
    "remote-1",
    createMockCursorStorage(),
    createTestConfig({ fetchFn: fetchFn as unknown as typeof fetch }),
    createMockOperationIndex(),
    timer,
  );
  const heard: Array<PeerManifest | null> = [];
  channel.setLocalManifest(() => LOCAL);
  channel.onPeerManifest((manifest) => heard.push(manifest));
  return { channel, heard };
}

describe("GqlRequestChannel peer manifests", () => {
  const channels: GqlRequestChannel[] = [];

  afterEach(async () => {
    for (const channel of channels.splice(0)) {
      await channel.shutdown();
    }
  });

  it("exchanges manifests on the handshake with a server that has the feature", async () => {
    const { state, fetchFn } = agreementServer(SERVER_NARROW);
    const timer = new ManualPollTimer();
    const { channel, heard } = channelWith(fetchFn, timer);
    channels.push(channel);

    await channel.init();

    expect(state.touches[0].query).toContain("manifest");
    expect(state.touches[0].variables.input?.manifest).toEqual(LOCAL);
    expect(heard).toEqual([SERVER_NARROW]);

    await timer.tick();
    expect(state.polls[0].query).toContain("manifestRevision");
    expect(state.polls[0].query).toContain("peerManifestRevision");
    // Both revisions match: no re-touch.
    expect(state.touches).toHaveLength(1);
  });

  it("falls back and reports a server without the fields as silent", async () => {
    const { fetchFn, touches, polls } = previousSchemaServer();
    const timer = new ManualPollTimer();
    const { channel, heard } = channelWith(fetchFn, timer);
    channels.push(channel);

    await channel.init();
    await timer.tick();
    await timer.tick();

    expect(touches).toHaveLength(2);
    expect(touches[1].variables.input).not.toHaveProperty("manifest");
    expect(touches[1].query).not.toContain("manifest");
    expect(heard).toEqual([null]);
    expect(polls).toHaveLength(2);
    expect(
      polls.every((poll) => !poll.query.includes("manifestRevision")),
    ).toBe(true);
    expect(channel.getConnectionState().state).toBe("connected");
  });

  it("re-touches once when the server's revision changes", async () => {
    const { state, fetchFn } = agreementServer(SERVER_NARROW);
    const timer = new ManualPollTimer();
    const { channel, heard } = channelWith(fetchFn, timer);
    channels.push(channel);
    await channel.init();

    state.server = SERVER_WIDE;
    await timer.tick();
    await vi.waitFor(() => expect(heard).toEqual([SERVER_NARROW, SERVER_WIDE]));

    await timer.tick();
    await timer.tick();
    expect(state.touches).toHaveLength(2);
  });

  it("re-touches once when the server holds a stale manifest for the client", async () => {
    const { state, fetchFn } = agreementServer(SERVER_NARROW);
    const timer = new ManualPollTimer();
    const { channel } = channelWith(fetchFn, timer);
    channels.push(channel);
    await channel.init();

    // A server restart that lost the client's manifest.
    state.held = null;
    await timer.tick();
    await vi.waitFor(() => expect(state.touches).toHaveLength(2));
    expect(state.held).toEqual(LOCAL);

    await timer.tick();
    await timer.tick();
    expect(state.touches).toHaveLength(2);
  });
});
