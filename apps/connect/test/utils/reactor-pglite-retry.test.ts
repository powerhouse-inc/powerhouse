import { ReactorClientBuilder } from "@powerhousedao/reactor-browser";
import type { ISigner } from "@powerhousedao/shared/document-model";
import type { IRenown } from "@renown/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getReactorPGlite } from "../../src/pglite.db.js";
import { createBrowserReactor } from "../../src/utils/reactor.js";

class FakePGlite {
  closed = false;
  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }
  syncToFs(): Promise<void> {
    return Promise.resolve();
  }
}

vi.mock("../../src/utils/pglite-runtime.js", () => ({
  detectReactorPgMajor: () => Promise.resolve(17),
  detectRelationalPgMajor: () => Promise.resolve(17),
  resolvePgMajorForRuntime: () => 17,
  loadPGliteModule: () => Promise.resolve({ PGlite: FakePGlite }),
}));

vi.mock("@electric-sql/pglite/live", () => ({ live: {} }));

vi.mock("../../src/utils/storage-namespace.js", () => ({
  REACTOR_PGLITE_NAME: "test-reactor",
  RELATIONAL_PGLITE_NAME: "test-relational",
}));

function stubRenown(): IRenown {
  const signer = {
    app: { name: "connect", key: "did:key:zDnaeTabKey" },
    user: undefined,
  } as unknown as ISigner;
  return { signer, user: undefined } as unknown as IRenown;
}

describe("the in-tab reactor store after a failed build", () => {
  afterEach(() => vi.restoreAllMocks());

  it("closes the instance and opens a fresh one on retry", async () => {
    vi.spyOn(ReactorClientBuilder.prototype, "buildModule").mockRejectedValue(
      new Error("migration failed"),
    );
    const first = (await getReactorPGlite()) as unknown as FakePGlite;

    await expect(
      createBrowserReactor([], [], stubRenown(), {}),
    ).rejects.toThrow("migration failed");

    expect(first.closed).toBe(true);
    const retried = await getReactorPGlite();
    expect(retried).not.toBe(first);
  });
});
