import { describe, expect, it } from "vitest";
import { createS3AuthPlugin } from "../src/auth/s3-auth-plugin.js";
import type { S3ObjectStore } from "../src/auth/s3-store.js";

/** In-memory S3ObjectStore for the plugin's persistence layer. */
function memStore(): S3ObjectStore & { keys: () => string[] } {
  const m = new Map<string, string>();
  return {
    getJSON<T>(k: string) {
      return Promise.resolve(
        m.has(k) ? (JSON.parse(m.get(k) as string) as T) : null,
      );
    },
    putJSON(k: string, v: unknown) {
      m.set(k, JSON.stringify(v));
      return Promise.resolve();
    },
    delete(k: string) {
      m.delete(k);
      return Promise.resolve();
    },
    exists(k: string) {
      return Promise.resolve(m.has(k));
    },
    keys: () => [...m.keys()],
  };
}

type Result = { err: Error | null; res?: unknown };
function call(
  fn: (cb: (err: Error | null, res?: unknown) => void) => void,
): Promise<Result> {
  return new Promise((resolve) => fn((err, res) => resolve({ err, res })));
}

function status(err: Error | null): number | undefined {
  if (!err) return undefined;
  const e = err as { status?: number; statusCode?: number };
  return e.status ?? e.statusCode;
}

const PREFIX = "vetra/";

describe("s3 auth plugin — accounts", () => {
  it("adduser registers a new user, then authenticate succeeds", async () => {
    const store = memStore();
    const p = createS3AuthPlugin(store, PREFIX);

    const add = await call((cb) => p.adduser("alice", "pw1", cb));
    expect(add.err).toBeNull();
    expect(add.res).toBe(true);
    expect(store.keys()).toContain("vetra/auth/users/alice.json");

    const auth = await call((cb) => p.authenticate("alice", "pw1", cb));
    expect(auth.err).toBeNull();
    expect(auth.res).toEqual(["alice"]);
  });

  it("adduser on an existing username is rejected (no silent overwrite / 201)", async () => {
    const store = memStore();
    const p = createS3AuthPlugin(store, PREFIX);
    await call((cb) => p.adduser("alice", "pw1", cb));

    const again = await call((cb) => p.adduser("alice", "different", cb));
    expect(again.err).not.toBeNull();
    expect(status(again.err)).toBe(409);
  });

  it("authenticate with a wrong password errors", async () => {
    const store = memStore();
    const p = createS3AuthPlugin(store, PREFIX);
    await call((cb) => p.adduser("alice", "pw1", cb));

    const bad = await call((cb) => p.authenticate("alice", "wrong", cb));
    expect(bad.err).not.toBeNull();
    expect(status(bad.err)).toBe(401);
  });

  it("authenticate for an unknown user defers (no error, not authenticated)", async () => {
    const store = memStore();
    const p = createS3AuthPlugin(store, PREFIX);
    const res = await call((cb) => p.authenticate("ghost", "pw", cb));
    expect(res.err).toBeNull();
    expect(res.res).toBe(false);
  });
});

describe("s3 auth plugin — ownership (npm-style TOFU)", () => {
  const alice = { name: "alice", groups: [] };
  const bob = { name: "bob", groups: [] };

  it("first publisher claims a free name; owner object is written", async () => {
    const store = memStore();
    const p = createS3AuthPlugin(store, PREFIX);

    const pub = await call((cb) =>
      p.allow_publish(alice, { name: "pkg-x" }, cb),
    );
    expect(pub.err).toBeNull();
    expect(pub.res).toBe(true);
    expect(store.keys()).toContain("vetra/auth/owners/pkg-x.json");
    expect(await store.getJSON("vetra/auth/owners/pkg-x.json")).toMatchObject({
      owners: ["alice"],
    });
  });

  it("the owner may publish again", async () => {
    const store = memStore();
    const p = createS3AuthPlugin(store, PREFIX);
    await call((cb) => p.allow_publish(alice, { name: "pkg-x" }, cb));

    const again = await call((cb) =>
      p.allow_publish(alice, { name: "pkg-x" }, cb),
    );
    expect(again.err).toBeNull();
    expect(again.res).toBe(true);
  });

  it("a different user is forbidden from publishing an owned name", async () => {
    const store = memStore();
    const p = createS3AuthPlugin(store, PREFIX);
    await call((cb) => p.allow_publish(alice, { name: "pkg-x" }, cb));

    const foreign = await call((cb) =>
      p.allow_publish(bob, { name: "pkg-x" }, cb),
    );
    expect(foreign.err).not.toBeNull();
    expect(status(foreign.err)).toBe(403);
  });

  it("unauthenticated publish is forbidden", async () => {
    const store = memStore();
    const p = createS3AuthPlugin(store, PREFIX);
    const anon = await call((cb) =>
      p.allow_publish({ name: null }, { name: "pkg-y" }, cb),
    );
    expect(anon.err).not.toBeNull();
    expect(status(anon.err)).toBe(403);
  });

  it("scoped names are keyed safely (encoded)", async () => {
    const store = memStore();
    const p = createS3AuthPlugin(store, PREFIX);
    const pub = await call((cb) =>
      p.allow_publish(alice, { name: "@scope/pkg" }, cb),
    );
    expect(pub.err).toBeNull();
    expect(store.keys()).toContain("vetra/auth/owners/%40scope%2Fpkg.json");
  });
});

describe("s3 auth plugin — unpublish + access", () => {
  const alice = { name: "alice", groups: [] };
  const bob = { name: "bob", groups: [] };

  it("only the owner may unpublish; others 403; unclaimed 403", async () => {
    const store = memStore();
    const p = createS3AuthPlugin(store, PREFIX);
    await call((cb) => p.allow_publish(alice, { name: "pkg-x" }, cb)); // alice owns

    const byOwner = await call((cb) =>
      p.allow_unpublish(alice, { name: "pkg-x" }, cb),
    );
    expect(byOwner.res).toBe(true);

    const byOther = await call((cb) =>
      p.allow_unpublish(bob, { name: "pkg-x" }, cb),
    );
    expect(status(byOther.err)).toBe(403);

    const unclaimed = await call((cb) =>
      p.allow_unpublish(alice, { name: "nope" }, cb),
    );
    expect(status(unclaimed.err)).toBe(403);
  });

  it("allow_access permits anonymous read", async () => {
    const store = memStore();
    const p = createS3AuthPlugin(store, PREFIX);
    const res = await call((cb) =>
      p.allow_access({ name: null }, { name: "anything" }, cb),
    );
    expect(res.err).toBeNull();
    expect(res.res).toBe(true);
  });
});
