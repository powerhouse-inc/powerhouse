import { describe, expect, it } from "vitest";
import { createS3Store, type S3SendClient } from "../src/auth/s3-store.js";
import type { S3Config } from "../src/types.js";

const s3: S3Config = {
  bucket: "test-bucket",
  endpoint: "https://s3.test",
  region: "test",
};

/** In-memory fake dispatching on the real AWS command class names, so no
 *  network or real SDK client is touched. */
class FakeS3 implements S3SendClient {
  store = new Map<string, string>();
  send(command: unknown): Promise<unknown> {
    const cmd = command as {
      constructor: { name: string };
      input: Record<string, string>;
    };
    const name = cmd.constructor.name;
    const key = cmd.input.Key;
    switch (name) {
      case "PutObjectCommand":
        this.store.set(key, cmd.input.Body);
        return Promise.resolve({});
      case "GetObjectCommand": {
        if (!this.store.has(key)) return Promise.reject(notFound("NoSuchKey"));
        const body = this.store.get(key);
        return Promise.resolve({
          Body: { transformToString: () => Promise.resolve(body) },
        });
      }
      case "HeadObjectCommand":
        return this.store.has(key)
          ? Promise.resolve({})
          : Promise.reject(notFound("NotFound"));
      case "DeleteObjectCommand":
        this.store.delete(key);
        return Promise.resolve({});
      default:
        return Promise.reject(new Error(`unexpected command ${name}`));
    }
  }
}

function notFound(errName: string): Error {
  const e = new Error(errName) as Error & {
    name: string;
    $metadata: { httpStatusCode: number };
  };
  e.name = errName;
  e.$metadata = { httpStatusCode: 404 };
  return e;
}

describe("createS3Store", () => {
  it("round-trips putJSON → getJSON", async () => {
    const store = createS3Store(s3, new FakeS3());
    await store.putJSON("auth/users/alice.json", { name: "alice", n: 1 });
    expect(await store.getJSON("auth/users/alice.json")).toEqual({
      name: "alice",
      n: 1,
    });
  });

  it("getJSON returns null for a missing key (not a throw)", async () => {
    const store = createS3Store(s3, new FakeS3());
    expect(await store.getJSON("auth/users/ghost.json")).toBeNull();
  });

  it("exists reflects presence, false for a missing key", async () => {
    const store = createS3Store(s3, new FakeS3());
    expect(await store.exists("k")).toBe(false);
    await store.putJSON("k", { a: 1 });
    expect(await store.exists("k")).toBe(true);
  });

  it("delete removes an object", async () => {
    const store = createS3Store(s3, new FakeS3());
    await store.putJSON("k", { a: 1 });
    await store.delete("k");
    expect(await store.exists("k")).toBe(false);
    expect(await store.getJSON("k")).toBeNull();
  });

  it("propagates non-404 errors", async () => {
    const broken: S3SendClient = {
      send() {
        return Promise.reject(new Error("kaboom"));
      },
    };
    const store = createS3Store(s3, broken);
    await expect(store.getJSON("k")).rejects.toThrow("kaboom");
  });
});
