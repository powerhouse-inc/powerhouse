import { afterEach, describe, expect, it, vi } from "vitest";
import { GqlRequestChannel } from "../../../../src/sync/channels/gql-req-channel.js";
import { GqlRequestChannelFactory } from "../../../../src/sync/channels/gql-request-channel-factory.js";
import type { IQueue } from "../../../../src/queue/interfaces.js";
import { isDriveAuthError } from "../../../../src/sync/errors.js";
import { DriveCollectionId } from "../../../../src/cache/operation-index-types.js";
import type { SyncRefusalHandler } from "../../../../src/sync/types.js";
import {
  ManualPollTimer,
  createMockCursorStorage,
  createMockLogger,
  createMockOperationIndex,
  createTestConfig,
} from "./test-helpers.js";

/** A remote that refuses every request with `status` and `body`. */
function refusing(status: number, body: string) {
  return vi.fn().mockResolvedValue(
    new Response(body, {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

function channelWith(
  fetchFn: typeof fetch,
  onRefused: SyncRefusalHandler | undefined,
) {
  return new GqlRequestChannel(
    createMockLogger(),
    "channel-1",
    "remote-1",
    createMockCursorStorage(),
    createTestConfig({ fetchFn, ...(onRefused ? { onRefused } : {}) }),
    createMockOperationIndex(),
    new ManualPollTimer(),
  );
}

describe("a sync channel's refusals", () => {
  const channels: GqlRequestChannel[] = [];

  afterEach(async () => {
    for (const channel of channels.splice(0)) await channel.shutdown();
  });

  it("tell the app the remote's url, the status and the door's reason, and still fail as auth errors", async () => {
    const onRefused = vi.fn();
    const channel = channelWith(
      refusing(
        401,
        JSON.stringify({ error: "Unauthorized", reason: "expired" }),
      ) as unknown as typeof fetch,
      onRefused,
    );
    channels.push(channel);

    const error = await channel.init().catch((e: unknown) => e);
    expect(isDriveAuthError(error)).toBe(true);
    expect(onRefused).toHaveBeenCalledWith("https://example.com/graphql", {
      status: 401,
      reason: "expired",
    });
  });

  it("name no reason for a refusal without one", async () => {
    const onRefused = vi.fn();
    const channel = channelWith(
      refusing(403, "Forbidden") as unknown as typeof fetch,
      onRefused,
    );
    channels.push(channel);

    await expect(channel.init()).rejects.toThrow("403");
    expect(onRefused).toHaveBeenCalledWith("https://example.com/graphql", {
      status: 403,
    });
  });

  it("are not reported for another failure, and a failing handler changes nothing", async () => {
    const onRefused = vi.fn(() => {
      throw new Error("handler broke");
    });
    const failing = channelWith(
      refusing(500, "{}") as unknown as typeof fetch,
      onRefused,
    );
    channels.push(failing);
    await expect(failing.init()).rejects.toThrow("500");
    expect(onRefused).not.toHaveBeenCalled();

    const refused = channelWith(
      refusing(401, "{}") as unknown as typeof fetch,
      onRefused,
    );
    channels.push(refused);
    const error = await refused.init().catch((e: unknown) => e);
    expect(isDriveAuthError(error)).toBe(true);
    expect(onRefused).toHaveBeenCalledOnce();
  });

  it("reach the handler the factory was built with", () => {
    const onRefused = vi.fn();
    const factory = new GqlRequestChannelFactory(
      createMockLogger(),
      undefined,
      { totalSize: vi.fn().mockResolvedValue(0) } as unknown as IQueue,
      onRefused,
    );
    const channel = factory.instance(
      "remote-id",
      "remote",
      { type: "gql", parameters: { url: "https://example.com/graphql" } },
      createMockCursorStorage(),
      DriveCollectionId.forDrive("drive"),
      { documentId: [], scope: [], branch: "main" },
      createMockOperationIndex(),
    ) as GqlRequestChannel;
    expect(
      (channel as unknown as { config: { onRefused?: unknown } }).config
        .onRefused,
    ).toBe(onRefused);
  });
});
