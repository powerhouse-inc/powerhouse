import { describe, expect, it } from "vitest";
import { createMemoryAuthStore } from "../src/auth/auth-store.js";
import { createRegistryAuthPlugin } from "../src/auth/registry-auth-plugin.js";

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

describe("registry auth plugin — accounts", () => {
  it("adduser registers a new user, then authenticate succeeds", async () => {
    const p = createRegistryAuthPlugin(createMemoryAuthStore());

    const add = await call((cb) => p.adduser("alice", "pw1", cb));
    expect(add.err).toBeNull();
    expect(add.res).toBe(true);

    const auth = await call((cb) => p.authenticate("alice", "pw1", cb));
    expect(auth.err).toBeNull();
    expect(auth.res).toEqual(["alice"]);
  });

  it("adduser on an existing username is rejected (atomic, no overwrite)", async () => {
    const p = createRegistryAuthPlugin(createMemoryAuthStore());
    await call((cb) => p.adduser("alice", "pw1", cb));

    const again = await call((cb) => p.adduser("alice", "different", cb));
    expect(status(again.err)).toBe(409);
  });

  it("authenticate with a wrong password errors (401)", async () => {
    const p = createRegistryAuthPlugin(createMemoryAuthStore());
    await call((cb) => p.adduser("alice", "pw1", cb));

    const bad = await call((cb) => p.authenticate("alice", "wrong", cb));
    expect(status(bad.err)).toBe(401);
  });

  it("authenticate for an unknown user defers (no error, not authenticated)", async () => {
    const p = createRegistryAuthPlugin(createMemoryAuthStore());
    const res = await call((cb) => p.authenticate("ghost", "pw", cb));
    expect(res.err).toBeNull();
    expect(res.res).toBe(false);
  });
});

describe("registry auth plugin — ownership (npm-style TOFU)", () => {
  const alice = { name: "alice", groups: [] };
  const bob = { name: "bob", groups: [] };

  it("first publisher claims a free name; others get 403", async () => {
    const p = createRegistryAuthPlugin(createMemoryAuthStore());

    const claim = await call((cb) =>
      p.allow_publish(alice, { name: "pkg-x" }, cb),
    );
    expect(claim.res).toBe(true);

    const owner = await call((cb) =>
      p.allow_publish(alice, { name: "pkg-x" }, cb),
    );
    expect(owner.res).toBe(true);

    const foreign = await call((cb) =>
      p.allow_publish(bob, { name: "pkg-x" }, cb),
    );
    expect(status(foreign.err)).toBe(403);
  });

  it("a free name stays claimable by anyone", async () => {
    const p = createRegistryAuthPlugin(createMemoryAuthStore());
    await call((cb) => p.allow_publish(alice, { name: "pkg-x" }, cb));
    const free = await call((cb) =>
      p.allow_publish(bob, { name: "pkg-y" }, cb),
    );
    expect(free.res).toBe(true);
  });

  it("unauthenticated publish is forbidden", async () => {
    const p = createRegistryAuthPlugin(createMemoryAuthStore());
    const anon = await call((cb) =>
      p.allow_publish({ name: null }, { name: "z" }, cb),
    );
    expect(status(anon.err)).toBe(403);
  });
});

describe("registry auth plugin — unpublish + access", () => {
  const alice = { name: "alice", groups: [] };
  const bob = { name: "bob", groups: [] };

  it("only the owner may unpublish; others 403; unclaimed 403", async () => {
    const p = createRegistryAuthPlugin(createMemoryAuthStore());
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
    const p = createRegistryAuthPlugin(createMemoryAuthStore());
    const res = await call((cb) =>
      p.allow_access({ name: null }, { name: "any" }, cb),
    );
    expect(res.res).toBe(true);
  });
});
