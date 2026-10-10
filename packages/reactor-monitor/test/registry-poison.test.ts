import type { PGlite } from "@electric-sql/pglite";
import {
  PGliteSessionPoisonedError,
  ReactorBuilder,
} from "@powerhousedao/reactor";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ReactorMonitorRegistry,
  type ManagedInProcessReactor,
} from "../src/index.js";
import type * as Store from "../src/store.js";
import { descriptor } from "./helpers.js";

const opened = vi.hoisted(() => [] as PGlite[]);

// Node has no IndexedDB; idb opens a memory PGlite so group commit runs for real.
vi.mock("../src/store.js", async (importOriginal) => {
  const original = await importOriginal<typeof Store>();
  return {
    ...original,
    openReactorStore: async (
      namespace: string,
      storage?: Parameters<typeof original.openReactorStore>[1],
    ) => {
      const pg = await original.openReactorStore(
        namespace,
        storage?.kind === "idb" ? { kind: "memory" } : storage,
      );
      opened.push(pg);
      return pg;
    },
  };
});

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 50));

describe("ReactorMonitorRegistry with a poisoned store", () => {
  const registries: ReactorMonitorRegistry[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const registry of registries.splice(0)) {
      await registry.killAll();
    }
    opened.splice(0);
  });

  function poisonable() {
    const groupCommit = vi.spyOn(
      ReactorBuilder.prototype,
      "withGroupCommitPGlite",
    );
    const registry = new ReactorMonitorRegistry();
    registries.push(registry);
    const poison = (): PGliteSessionPoisonedError => {
      const cause = new PGliteSessionPoisonedError(new Error("dead wasm call"));
      groupCommit.mock.calls[0][0].onUnrecoverable(cause);
      return cause;
    };
    return { groupCommit, registry, poison };
  }

  /** The poisoned reactor's stop waits on `stop` before its store closes. */
  async function failWithHungStop(name: string) {
    const { registry, poison } = poisonable();
    const reactor = (await registry.provision(
      descriptor(name, { storage: { kind: "idb" } }),
    )) as ManagedInProcessReactor;
    const stop = deferred();
    vi.spyOn(reactor.module.reactor, "kill").mockReturnValue({
      completed: stop.promise,
    } as ReturnType<typeof reactor.module.reactor.kill>);
    const store = opened[0];
    poison();
    await vi.waitFor(() => expect(registry.get(name)?.status).toBe("failed"));
    return { registry, stop, store };
  }

  it("moves a ready reactor to failed and kills it", async () => {
    const { groupCommit, registry, poison } = poisonable();

    const reactor = await registry.provision(
      descriptor("poisoned", { storage: { kind: "idb" } }),
    );
    expect(registry.get("poisoned")?.status).toBe("ready");
    expect(groupCommit).toHaveBeenCalledTimes(1);

    const cause = poison();

    await vi.waitFor(() => expect(reactor.isShutdown()).toBe(true));
    const entry = registry.get("poisoned");
    expect(entry?.status).toBe("failed");
    expect(entry?.error).toBe(cause);
    expect(registry.reactor("poisoned")).toBeUndefined();
  });

  it("re-provisions a failed name only after its store closed", async () => {
    const { registry, stop, store } = await failWithHungStop("reopen");

    const again = registry.provision(
      descriptor("reopen", { storage: { kind: "idb" } }),
    );
    await tick();
    expect(opened).toHaveLength(1);
    expect(store.closed).toBe(false);

    stop.resolve();
    await again;
    expect(store.closed).toBe(true);
    expect(opened).toHaveLength(2);
    expect(registry.get("reopen")?.status).toBe("ready");
  });

  it("killAll waits for a failed reactor's store to close", async () => {
    const { registry, stop, store } = await failWithHungStop("teardown");

    let done = false;
    const killing = registry.killAll().then(() => {
      done = true;
    });
    await tick();
    expect(done).toBe(false);

    stop.resolve();
    await killing;
    expect(store.closed).toBe(true);
  });

  it("kill(name) waits for a failed reactor's store to close", async () => {
    const { registry, stop, store } = await failWithHungStop("forget");

    let done = false;
    const killing = registry.kill("forget").then(() => {
      done = true;
    });
    await tick();
    expect(done).toBe(false);
    expect(registry.get("forget")).toBeUndefined();

    stop.resolve();
    await killing;
    expect(store.closed).toBe(true);
  });

  it("fails a provision whose store is poisoned while it boots", async () => {
    // Called with the builder as `this` below.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const original = ReactorBuilder.prototype.withGroupCommitPGlite;
    vi.spyOn(
      ReactorBuilder.prototype,
      "withGroupCommitPGlite",
    ).mockImplementation(function (this: ReactorBuilder, options) {
      // Before buildModule resolves: provision() is still running.
      options.onUnrecoverable(
        new PGliteSessionPoisonedError(new Error("poisoned at boot")),
      );
      return original.call(this, options);
    });
    const registry = new ReactorMonitorRegistry();
    registries.push(registry);

    await expect(
      registry.provision(descriptor("boot", { storage: { kind: "idb" } })),
    ).rejects.toThrow(/poisoned at boot/);

    expect(registry.get("boot")?.status).toBe("failed");
    expect(opened).toHaveLength(1);
    expect(opened[0].closed).toBe(true);
  });
});
