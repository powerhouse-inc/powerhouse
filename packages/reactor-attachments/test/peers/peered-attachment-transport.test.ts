import {
  GQL_CHANNEL_TYPE,
  LOCAL_CHANNEL_TYPE,
  type ISyncManager,
} from "@powerhousedao/reactor";
import { describe, expect, it } from "vitest";
import type { IAttachmentTransport } from "../../src/interfaces.js";
import {
  attachmentOriginOf,
  PeeredAttachmentTransport,
} from "../../src/peers/index.js";
import type { TransportFetchResult } from "../../src/types.js";

const HASH = "a".repeat(64);
const DOC = "document-1";

function syncManagerWith(
  remotes: Array<{ type: string; url?: string }>,
): Pick<ISyncManager, "list"> {
  return {
    list: () =>
      remotes.map((remote, index) => ({
        meta: {
          id: `remote-${index}`,
          name: `remote-${index}`,
          channelConfig: {
            type: remote.type,
            parameters: remote.url === undefined ? {} : { url: remote.url },
          },
        },
        channel: {},
      })),
  } as unknown as Pick<ISyncManager, "list">;
}

function source(
  answer: TransportFetchResult | (() => never),
  calls?: string[],
  label = "source",
): IAttachmentTransport {
  return {
    fetch: () => {
      calls?.push(label);
      if (typeof answer === "function") {
        answer();
      }
      return Promise.resolve(answer as TransportFetchResult);
    },
    announce: () => Promise.resolve(),
    push: () => Promise.resolve(),
  };
}

describe("attachmentOriginOf", () => {
  it("reduces a GraphQL url to its host origin so the attachment route is not nested under it", () => {
    expect(attachmentOriginOf("http://localhost:4001/graphql/my-drive")).toBe(
      "http://localhost:4001",
    );
    expect(attachmentOriginOf("http://localhost:4001/graphql")).toBe(
      "http://localhost:4001",
    );
    expect(attachmentOriginOf("http://localhost:4001/")).toBe(
      "http://localhost:4001",
    );
  });

  it("is not fooled by the scheme's own '//' when a host is named 'graphql'", () => {
    expect(attachmentOriginOf("http://graphql.example.com/graphql/x")).toBe(
      "http://graphql.example.com",
    );
  });

  it("takes the host origin of a path-prefixed deployment, not the prefix", () => {
    expect(attachmentOriginOf("https://host/ph/graphql/drive")).toBe(
      "https://host",
    );
  });
});

describe("PeeredAttachmentTransport", () => {
  it("derives Switchboard sources from the live sync manager's gql remotes", () => {
    const transport = new PeeredAttachmentTransport({
      syncManager: syncManagerWith([
        { type: GQL_CHANNEL_TYPE, url: "http://a/graphql/d1" },
        { type: GQL_CHANNEL_TYPE, url: "http://a/graphql/d2" },
        { type: LOCAL_CHANNEL_TYPE },
        { type: GQL_CHANNEL_TYPE, url: "http://b/graphql/d1" },
      ]),
    });
    // Deduplicated by origin: two drives on one host are one attachment host.
    expect(transport.switchboardSources()).toEqual(["http://a", "http://b"]);
  });

  it("includes an explicit attachment host that is not a sync remote", () => {
    const transport = new PeeredAttachmentTransport({
      switchboardUrl: "http://attachments.example",
      syncManager: syncManagerWith([]),
    });
    expect(transport.switchboardSources()).toEqual([
      "http://attachments.example",
    ]);
  });

  it("answers not-found with no sources at all rather than erroring", async () => {
    const transport = new PeeredAttachmentTransport();
    await expect(transport.fetch(HASH, DOC)).resolves.toEqual({
      kind: "not-found",
    });
  });

  it("tries local peers before Switchboards and returns the first data answer", async () => {
    const calls: string[] = [];
    const transport = new PeeredAttachmentTransport({
      syncManager: syncManagerWith([
        { type: GQL_CHANNEL_TYPE, url: "http://a/graphql/d" },
      ]),
    });
    transport.addPeer(
      "peer-a",
      "col-1",
      source(
        {
          kind: "data",
          response: {
            hash: HASH,
            metadata: {
              mimeType: "text/plain",
              fileName: "x",
              sizeBytes: 0,
              extension: null,
              createdAtUtc: "2026-01-01T00:00:00.000Z",
            },
            body: new ReadableStream<Uint8Array>({
              start: (controller) => controller.close(),
            }),
          },
        },
        calls,
        "peer-a",
      ),
    );

    const result = await transport.fetch(HASH, DOC);
    expect(result.kind).toBe("data");
    // The Switchboard was never asked: the local hop answered.
    expect(calls).toEqual(["peer-a"]);
  });

  it("prefers a pending answer over a not-found from another source", async () => {
    const transport = new PeeredAttachmentTransport();
    transport.addPeer("quiet", "col-1", source({ kind: "not-found" }));
    transport.addPeer(
      "uploading",
      "col-1",
      source({
        kind: "pending",
        hash: HASH,
        expiresAtUtc: "2026-01-01T00:05:00.000Z",
        retryAfterMs: 1_000,
      }),
    );

    await expect(transport.fetch(HASH, DOC)).resolves.toEqual({
      kind: "pending",
      hash: HASH,
      expiresAtUtc: "2026-01-01T00:05:00.000Z",
      retryAfterMs: 1_000,
    });
  });

  it("reports not-found only when every source said so", async () => {
    const transport = new PeeredAttachmentTransport();
    transport.addPeer("one", "col-1", source({ kind: "not-found" }));
    transport.addPeer("two", "col-1", source({ kind: "not-found" }));
    await expect(transport.fetch(HASH, DOC)).resolves.toEqual({
      kind: "not-found",
    });
  });

  it("rethrows when nothing could be reached, instead of laundering it as not-found", async () => {
    const transport = new PeeredAttachmentTransport();
    transport.addPeer(
      "severed",
      "col-1",
      source(() => {
        throw new Error("port is closed");
      }),
    );
    await expect(transport.fetch(HASH, DOC)).rejects.toThrow(/port is closed/);
  });

  it("surfaces an error rather than a not-found when a source errored and the rest only said not-found", async () => {
    // A not-found from one source must not bury another's transient failure:
    // the caller would otherwise spend its (smaller) lag budget on what was
    // really an unreachable peer. Error outranks not-found-unanimous.
    const transport = new PeeredAttachmentTransport();
    transport.addPeer(
      "severed",
      "col-1",
      source(() => {
        throw new Error("port is closed");
      }),
    );
    transport.addPeer("live", "col-1", source({ kind: "not-found" }));
    await expect(transport.fetch(HASH, DOC)).rejects.toThrow(/port is closed/);
  });

  it("still prefers a pending answer over an error from another source", async () => {
    const transport = new PeeredAttachmentTransport();
    transport.addPeer(
      "severed",
      "col-1",
      source(() => {
        throw new Error("port is closed");
      }),
    );
    transport.addPeer(
      "uploading",
      "col-1",
      source({
        kind: "pending",
        hash: HASH,
        expiresAtUtc: "2026-01-01T00:05:00.000Z",
        retryAfterMs: 1_000,
      }),
    );
    await expect(transport.fetch(HASH, DOC)).resolves.toEqual({
      kind: "pending",
      hash: HASH,
      expiresAtUtc: "2026-01-01T00:05:00.000Z",
      retryAfterMs: 1_000,
    });
  });

  it("refuses a second link to the same peer on the same channel, and forgets one on removal", () => {
    const transport = new PeeredAttachmentTransport();
    transport.addPeer("peer", "col-1", source({ kind: "not-found" }));
    expect(transport.peerNames()).toEqual(["peer"]);
    expect(() =>
      transport.addPeer("peer", "col-1", source({ kind: "not-found" })),
    ).toThrow(/already registered/);

    transport.removePeer("peer", "col-1");
    expect(transport.peerNames()).toEqual([]);
  });

  it("keeps two links to the same peer on different channels distinct", () => {
    const transport = new PeeredAttachmentTransport();
    transport.addPeer("peer", "col-1", source({ kind: "not-found" }));
    // A second collection with the same peer must NOT collide with the first.
    expect(() =>
      transport.addPeer("peer", "col-2", source({ kind: "not-found" })),
    ).not.toThrow();
    // peerNames reports the reactor once, not once per channel.
    expect(transport.peerNames()).toEqual(["peer"]);

    // Dropping one channel leaves the other serving.
    transport.removePeer("peer", "col-1");
    expect(transport.peerNames()).toEqual(["peer"]);
    transport.removePeer("peer", "col-2");
    expect(transport.peerNames()).toEqual([]);
  });

  it("is pull-only", async () => {
    const transport = new PeeredAttachmentTransport();
    await expect(transport.push()).rejects.toThrow(/pull-only/);
  });
});
