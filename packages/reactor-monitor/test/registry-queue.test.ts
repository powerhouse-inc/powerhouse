import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProvisionOptions } from "../src/provision.js";
import { ReactorMonitorRegistry } from "../src/registry.js";
import type { ManagedReactor, ReactorDescriptor } from "../src/types.js";

type Build = {
  name: string;
  options: ProvisionOptions;
  resolve: (reactor: ManagedReactor) => void;
  reject: (error: Error) => void;
};

const builds = vi.hoisted(() => [] as Build[]);

vi.mock("../src/provision.js", () => ({
  provision: (descriptor: ReactorDescriptor, options: ProvisionOptions) =>
    new Promise((resolve, reject) => {
      builds.push({ name: descriptor.name, options, resolve, reject });
    }),
}));

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

const descriptor = (name: string) =>
  ({ name, kind: "remote" }) as ReactorDescriptor;

function fakeReactor(name: string, log: string[], held?: Promise<void>) {
  return {
    kill: async () => {
      log.push(`kill-start ${name}`);
      await held;
      log.push(`kill-done ${name}`);
    },
  } as unknown as ManagedReactor;
}

async function ready(
  registry: ReactorMonitorRegistry,
  name: string,
  log: string[],
  held?: Promise<void>,
): Promise<Build> {
  const provisioned = registry.provision(descriptor(name));
  await vi.waitFor(() => expect(builds.at(-1)?.name).toBe(name));
  const build = builds.at(-1)!;
  build.resolve(fakeReactor(name, log, held));
  await provisioned;
  return build;
}

describe("ReactorMonitorRegistry op queue", () => {
  afterEach(() => {
    builds.splice(0);
  });

  it("killAll kills a ready name while another name's build is pending", async () => {
    const log: string[] = [];
    const registry = new ReactorMonitorRegistry();
    const pending = registry.provision(descriptor("a"));
    pending.catch(() => undefined);
    await vi.waitFor(() => expect(builds).toHaveLength(1));
    await ready(registry, "b", log);

    let settled = false;
    const all = registry.killAll().then(() => {
      settled = true;
    });
    await vi.waitFor(() => expect(log).toContain("kill-done b"));
    expect(settled).toBe(false);

    builds[0].reject(new Error("never answered"));
    await all;
    await expect(pending).rejects.toThrow("never answered");
    expect(registry.list()).toHaveLength(0);
  });

  it("queues a failed reactor's close before a listener can throw", async () => {
    const log: string[] = [];
    const registry = new ReactorMonitorRegistry();
    const held = deferred();
    const build = await ready(registry, "c", log, held.promise);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    let armed = true;
    registry.subscribe(() => {
      if (armed && registry.get("c")?.status === "failed") {
        armed = false;
        throw new Error("listener boom");
      }
    });
    build.options.onUnrecoverable?.(new Error("poison"));
    await tick();
    expect(log).toEqual(["kill-start c"]);

    const again = registry.provision(descriptor("c"));
    again.catch(() => undefined);
    await tick();
    expect(builds).toHaveLength(1);

    held.resolve();
    await vi.waitFor(() => expect(builds).toHaveLength(2));
    expect(log).toEqual(["kill-start c", "kill-done c"]);
    expect(errors).toHaveBeenCalled();
    builds[1].reject(new Error("done"));
    errors.mockRestore();
  });

  it("builds a name a failed publish re-provisions only after the close", async () => {
    const log: string[] = [];
    const registry = new ReactorMonitorRegistry();
    const held = deferred();
    const build = await ready(registry, "e", log, held.promise);

    let armed = true;
    registry.subscribe(() => {
      if (armed && registry.get("e")?.status === "failed") {
        armed = false;
        registry.provision(descriptor("e")).catch(() => undefined);
      }
    });
    build.options.onUnrecoverable?.(new Error("poison"));
    await tick();
    expect(builds).toHaveLength(1);

    held.resolve();
    await vi.waitFor(() => expect(builds).toHaveLength(2));
    expect(log).toEqual(["kill-start e", "kill-done e"]);
    builds[1].reject(new Error("done"));
  });

  it("builds a name a kill publish re-provisions only after the kill", async () => {
    const log: string[] = [];
    const registry = new ReactorMonitorRegistry();
    const held = deferred();
    await ready(registry, "k", log, held.promise);

    let armed = true;
    registry.subscribe(() => {
      if (armed && !registry.get("k")) {
        armed = false;
        registry.provision(descriptor("k")).catch(() => undefined);
      }
    });
    const killed = registry.kill("k");
    await tick();
    expect(log).toEqual(["kill-start k"]);
    expect(builds).toHaveLength(1);

    held.resolve();
    await killed;
    await vi.waitFor(() => expect(builds).toHaveLength(2));
    expect(log).toEqual(["kill-start k", "kill-done k"]);
    builds[1].reject(new Error("done"));
  });

  it("kills a ready reactor even when a listener throws on kill's publish", async () => {
    const log: string[] = [];
    const registry = new ReactorMonitorRegistry();
    await ready(registry, "t", log);
    registry.subscribe(() => {
      throw new Error("listener boom");
    });

    await expect(registry.kill("t")).rejects.toThrow("listener boom");
    await vi.waitFor(() => expect(log).toContain("kill-done t"));
  });
});
