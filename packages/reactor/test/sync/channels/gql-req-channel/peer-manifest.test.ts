import {
  localPeerManifest,
  PEER_CAPABILITIES,
  type PeerCapability,
  type PeerManifest,
} from "@powerhousedao/shared/document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GqlRequestChannel } from "../../../../src/sync/channels/gql-req-channel.js";
import { ChannelError } from "../../../../src/sync/errors.js";
import { SyncOperation } from "../../../../src/sync/sync-operation.js";
import { ChannelErrorSource } from "../../../../src/sync/types.js";
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
  variables: {
    input?: Record<string, unknown>;
    manifestRevision?: string;
    refusals?: unknown[];
  };
};

/** A server with peer agreement, holding what the client last touched with. */
function agreementServer(initial: PeerManifest) {
  const state = {
    server: initial,
    held: null as PeerManifest | null,
    touches: [] as Body[],
    polls: [] as Body[],
    envelopes: [] as unknown[],
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
          envelopes: state.envelopes.splice(0),
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
  channel.onPeerManifest((manifest) => {
    heard.push(manifest);
  });
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
    expect(state.polls[0].variables.manifestRevision).toBe(LOCAL.revision);
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
      polls.every(
        (poll) =>
          !poll.query.includes("manifestRevision") &&
          !("manifestRevision" in poll.variables),
      ),
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

  it("refreshes a stale record before the polled rows reach the inbox", async () => {
    const { state, fetchFn } = agreementServer(SERVER_WIDE);
    const timer = new ManualPollTimer();
    const { channel, heard } = channelWith(fetchFn, timer);
    channels.push(channel);
    await channel.init();

    // The server restarted narrower and serves rows under its new manifest.
    state.server = SERVER_NARROW;
    state.envelopes.push({
      type: "operations",
      channelMeta: { id: "channel-1" },
      operations: [
        {
          operation: {
            index: 0,
            timestampUtcMs: "2026-09-26T00:00:00.000Z",
            hash: "h",
            skip: 0,
            id: "op-1",
            action: {
              id: "a-1",
              type: "ADD_FOLDER",
              timestampUtcMs: "2026-09-26T00:00:00.000Z",
              input: {},
              scope: "global",
            },
          },
          context: {
            documentId: "doc",
            documentType: "powerhouse/document-drive",
            scope: "global",
            branch: "main",
            ordinal: 1,
          },
        },
      ],
    });
    const heardAtAdmission: Array<PeerManifest | null> = [];
    channel.inbox.onAdded(() => heardAtAdmission.push(heard.at(-1) ?? null));

    await timer.tick();

    await vi.waitFor(() => expect(heardAtAdmission).toHaveLength(1));
    expect(heardAtAdmission[0]).toEqual(SERVER_NARROW);
    expect(state.touches).toHaveLength(2);
  });

  it("reports its refusals of polled rows on the next poll, once", async () => {
    const { state, fetchFn } = agreementServer(SERVER_WIDE);
    const timer = new ManualPollTimer();
    const { channel } = channelWith(fetchFn, timer);
    channels.push(channel);
    await channel.init();

    const refused = new SyncOperation(
      "sync-1",
      "job-1",
      [],
      "remote-1",
      "doc",
      ["global"],
      "main",
      [],
    );
    refused.failed(
      new ChannelError(
        ChannelErrorSource.Inbox,
        new Error("unsupported"),
        "UNSUPPORTED_PROTOCOL",
      ),
    );
    channel.deadLetter.add(refused);

    await timer.tick();
    await timer.tick();

    expect(state.polls[0].variables.refusals).toEqual([
      { documentId: "doc", branch: "main" },
    ]);
    expect(state.polls[1].variables.refusals).toEqual([]);
  });

  it("hears a server restarted into the same build, so its holds are re-checked", async () => {
    const before = localPeerManifest([TEST_PROTOCOL], {}, undefined, 1);
    const after = localPeerManifest([TEST_PROTOCOL], {}, undefined, 2);
    const { state, fetchFn } = agreementServer(before);
    const timer = new ManualPollTimer();
    const { channel, heard } = channelWith(fetchFn, timer);
    channels.push(channel);
    await channel.init();

    state.server = after;
    await timer.tick();

    await vi.waitFor(() => expect(heard).toEqual([before, after]));
  });

  it("probes a silent server again and hears it once it serves agreement", async () => {
    const previous = previousSchemaServer();
    const upgraded = agreementServer(SERVER_WIDE);
    let serving = previous.fetchFn;
    const fetchFn = vi.fn((url: string, options: RequestInit) =>
      serving(url, options),
    );
    const timer = new ManualPollTimer();
    const { channel, heard } = channelWith(fetchFn, timer);
    channels.push(channel);
    await channel.init();
    expect(heard).toEqual([null]);

    serving = upgraded.fetchFn;
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now + 5 * 60_000);
    try {
      await timer.tick();
      await timer.tick();
    } finally {
      clock.mockRestore();
    }

    expect(heard).toEqual([null, SERVER_WIDE]);
    expect(upgraded.state.touches[0].variables.input?.manifest).toEqual(LOCAL);
    expect(upgraded.state.polls.at(-1)?.variables.manifestRevision).toBe(
      LOCAL.revision,
    );
  });
});
