import {
  PGliteSessionPoisonedError,
  ReactorBuilder,
} from "@powerhousedao/reactor";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReactorMonitorRegistry } from "../src/index.js";
import type * as Store from "../src/store.js";
import { descriptor } from "./helpers.js";

// Node has no IndexedDB; idb opens a memory PGlite so group commit runs for real.
vi.mock("../src/store.js", async (importOriginal) => {
  const original = await importOriginal<typeof Store>();
  return {
    ...original,
    openReactorStore: (
      namespace: string,
      storage?: Parameters<typeof original.openReactorStore>[1],
    ) =>
      original.openReactorStore(
        namespace,
        storage?.kind === "idb" ? { kind: "memory" } : storage,
      ),
  };
});

describe("ReactorMonitorRegistry with a poisoned store", () => {
  const registries: ReactorMonitorRegistry[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const registry of registries.splice(0)) {
      await registry.killAll();
    }
  });

  it("moves a ready reactor to failed and kills it", async () => {
    const groupCommit = vi.spyOn(
      ReactorBuilder.prototype,
      "withGroupCommitPGlite",
    );
    const registry = new ReactorMonitorRegistry();
    registries.push(registry);

    const reactor = await registry.provision(
      descriptor("poisoned", { storage: { kind: "idb" } }),
    );
    expect(registry.get("poisoned")?.status).toBe("ready");
    expect(groupCommit).toHaveBeenCalledTimes(1);

    const cause = new PGliteSessionPoisonedError(new Error("dead wasm call"));
    const [options] = groupCommit.mock.calls[0];
    options.onUnrecoverable(cause);

    await vi.waitFor(() => expect(reactor.isShutdown()).toBe(true));
    const entry = registry.get("poisoned");
    expect(entry?.status).toBe("failed");
    expect(entry?.error).toBe(cause);
    expect(registry.reactor("poisoned")).toBeUndefined();
  });
});
