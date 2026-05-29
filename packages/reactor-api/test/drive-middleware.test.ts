/**
 * Unit tests for createDriveFetchMiddleware.
 *
 * The middleware sits between auth and the GraphQL handler. It:
 *   - passes through requests without a Drive-Id header (LB round-robin path)
 *   - passes through when the cache claims the drive locally
 *   - passes through cache-miss requests for createDocument /
 *     createEmptyDocument operations (drive-creation case)
 *   - returns 421 wrong-shard for cache-miss requests on other operations
 *   - records the validated drive id on a per-request map for the
 *     context factory to read into context.driveId
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  createDriveFetchMiddleware,
  getRequestDriveId,
} from "../src/graphql/gateway/drive-middleware.js";
import { DriveOwnershipCache } from "../src/graphql/gateway/drive-ownership-cache.js";
import type { FetchHandler } from "../src/graphql/gateway/types.js";

function makeCache(initialDrives: string[] = []): DriveOwnershipCache {
  const cache = new DriveOwnershipCache(
    {} as unknown as ConstructorParameters<typeof DriveOwnershipCache>[0],
  );
  for (const id of initialDrives) {
    cache.add(id);
  }
  return cache;
}

function makeRequest(opts: {
  driveId?: string;
  body?: unknown;
  method?: string;
}): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (opts.driveId !== undefined) {
    headers["drive-id"] = opts.driveId;
  }
  return new Request("http://localhost/graphql", {
    method: opts.method ?? "POST",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

describe("createDriveFetchMiddleware", () => {
  let nextCalls: Request[];
  let next: FetchHandler;

  beforeEach(() => {
    nextCalls = [];
    next = (req: Request) => {
      nextCalls.push(req);
      return Promise.resolve(new Response("ok", { status: 200 }));
    };
  });

  it("passes through when Drive-Id header is missing", async () => {
    const cache = makeCache(["drive-a"]);
    const handler = createDriveFetchMiddleware(cache)(next);

    const res = await handler(
      makeRequest({ body: { query: "{ __typename }" } }),
    );

    expect(res.status).toBe(200);
    expect(nextCalls).toHaveLength(1);
    expect(getRequestDriveId(nextCalls[0])).toBeUndefined();
  });

  it("passes through and records the drive id when the cache has the drive", async () => {
    const cache = makeCache(["drive-a"]);
    const handler = createDriveFetchMiddleware(cache)(next);

    const req = makeRequest({
      driveId: "drive-a",
      body: { operationName: "mutateDocument" },
    });
    const res = await handler(req);

    expect(res.status).toBe(200);
    expect(nextCalls).toHaveLength(1);
    expect(getRequestDriveId(req)).toBe("drive-a");
  });

  it("passes through a createDocument cache-miss (operationName)", async () => {
    const cache = makeCache([]);
    const handler = createDriveFetchMiddleware(cache)(next);

    const res = await handler(
      makeRequest({
        driveId: "new-drive",
        body: { operationName: "createDocument" },
      }),
    );

    expect(res.status).toBe(200);
    expect(nextCalls).toHaveLength(1);
  });

  it("passes through a createEmptyDocument cache-miss (operationName)", async () => {
    const cache = makeCache([]);
    const handler = createDriveFetchMiddleware(cache)(next);

    const res = await handler(
      makeRequest({
        driveId: "new-drive",
        body: { operationName: "createEmptyDocument" },
      }),
    );

    expect(res.status).toBe(200);
    expect(nextCalls).toHaveLength(1);
  });

  it("passes through createDocument cache-miss extracted from query string", async () => {
    const cache = makeCache([]);
    const handler = createDriveFetchMiddleware(cache)(next);

    const res = await handler(
      makeRequest({
        driveId: "new-drive",
        body: { query: "mutation createDocument($x: Int) { x }" },
      }),
    );

    expect(res.status).toBe(200);
    expect(nextCalls).toHaveLength(1);
  });

  it("returns 421 wrong-shard for cache-miss on a non-bypass operation", async () => {
    const cache = makeCache(["drive-a"]);
    const handler = createDriveFetchMiddleware(cache)(next);

    const res = await handler(
      makeRequest({
        driveId: "drive-foreign",
        body: { operationName: "mutateDocument" },
      }),
    );

    expect(res.status).toBe(421);
    expect(nextCalls).toHaveLength(0);

    const body = (await res.json()) as { error: string; driveId: string };
    expect(body.error).toBe("wrong-shard");
    expect(body.driveId).toBe("drive-foreign");
  });

  it("returns 421 wrong-shard when the body is malformed JSON (fail closed)", async () => {
    const cache = makeCache([]);
    const handler = createDriveFetchMiddleware(cache)(next);

    const req = new Request("http://localhost/graphql", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "drive-id": "drive-foreign",
      },
      body: "{ not valid json",
    });
    const res = await handler(req);

    expect(res.status).toBe(421);
    expect(nextCalls).toHaveLength(0);
  });

  it("returns 421 wrong-shard when the body has neither operationName nor query", async () => {
    const cache = makeCache([]);
    const handler = createDriveFetchMiddleware(cache)(next);

    const res = await handler(
      makeRequest({ driveId: "drive-foreign", body: {} }),
    );

    expect(res.status).toBe(421);
    expect(nextCalls).toHaveLength(0);
  });

  it("returns 421 wrong-shard for non-POST methods on cache-miss", async () => {
    const cache = makeCache([]);
    const handler = createDriveFetchMiddleware(cache)(next);

    const req = new Request("http://localhost/graphql?query={__typename}", {
      method: "GET",
      headers: { "drive-id": "drive-foreign" },
    });
    const res = await handler(req);

    expect(res.status).toBe(421);
    expect(nextCalls).toHaveLength(0);
  });

  it("treats an empty Drive-Id header as missing (passes through)", async () => {
    const cache = makeCache([]);
    const handler = createDriveFetchMiddleware(cache)(next);

    const res = await handler(
      makeRequest({ driveId: "", body: { operationName: "mutateDocument" } }),
    );

    expect(res.status).toBe(200);
    expect(nextCalls).toHaveLength(1);
  });

  it("preserves the request body for downstream handlers (clone, not consume)", async () => {
    const cache = makeCache([]);
    const consumedBodies: string[] = [];
    const consumingNext: FetchHandler = async (req: Request) => {
      consumedBodies.push(await req.text());
      return new Response("ok", { status: 200 });
    };
    const handler = createDriveFetchMiddleware(cache)(consumingNext);

    await handler(
      makeRequest({
        driveId: "new-drive",
        body: { operationName: "createDocument", variables: { foo: 1 } },
      }),
    );

    expect(consumedBodies).toHaveLength(1);
    expect(JSON.parse(consumedBodies[0])).toEqual({
      operationName: "createDocument",
      variables: { foo: 1 },
    });
  });
});
