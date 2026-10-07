import { afterEach, describe, expect, it } from "vitest";
import { ReactorMonitorRegistry } from "../src/index.js";
import { descriptor } from "./helpers.js";

const DRIVE_TYPE = "powerhouse/document-drive";

describe("ReactorMonitorRegistry", () => {
  const registries: ReactorMonitorRegistry[] = [];

  function registry(): ReactorMonitorRegistry {
    const next = new ReactorMonitorRegistry();
    registries.push(next);
    return next;
  }

  afterEach(async () => {
    for (const r of registries.splice(0)) {
      await r.killAll();
    }
  });

  it("holds several named reactors at once", async () => {
    const monitor = registry();

    await monitor.provision(descriptor("one"));
    await monitor.provision(descriptor("two"));

    expect(monitor.list().map((entry) => entry.name)).toEqual(["one", "two"]);
    expect(monitor.reactor("one")).toBeDefined();
    expect(monitor.reactor("one")).not.toBe(monitor.reactor("two"));
  });

  it("publishes provisioning then ready", async () => {
    const monitor = registry();
    const seen: string[][] = [];
    monitor.subscribe(() =>
      seen.push(monitor.list().map((entry) => entry.status)),
    );

    await monitor.provision(descriptor("staged"));

    expect(seen[0]).toEqual(["provisioning"]);
    expect(seen.at(-1)).toEqual(["ready"]);
  });

  it("keeps the snapshot identity stable between changes", async () => {
    const monitor = registry();
    await monitor.provision(descriptor("stable"));

    const first = monitor.getSnapshot();

    expect(monitor.getSnapshot()).toBe(first);
    await monitor.provision(descriptor("other"));
    expect(monitor.getSnapshot()).not.toBe(first);
  });

  it("refuses a duplicate name", async () => {
    const monitor = registry();
    await monitor.provision(descriptor("dup"));

    await expect(monitor.provision(descriptor("dup"))).rejects.toThrow(
      /already ready/,
    );
  });

  it("records a failure and lets the name be retried", async () => {
    const monitor = registry();

    await expect(
      monitor.provision({ ...descriptor("bad"), name: "   " }),
    ).rejects.toThrow(/Invalid reactor name/);

    const failed = monitor.get("   ");
    expect(failed?.status).toBe("failed");
    expect(failed?.error?.message).toMatch(/Invalid reactor name/);
    expect(monitor.reactor("   ")).toBeUndefined();
  });

  it("kills one reactor and forgets it", async () => {
    const monitor = registry();
    const reactor = await monitor.provision(descriptor("killable"));

    await monitor.kill("killable");

    expect(monitor.get("killable")).toBeUndefined();
    expect(monitor.list()).toEqual([]);
    expect(reactor.isShutdown()).toBe(true);
  });

  it("killAll empties the registry and shuts every reactor down", async () => {
    const monitor = registry();
    const a = await monitor.provision(descriptor("all-a"));
    const b = await monitor.provision(descriptor("all-b"));

    await monitor.killAll();

    expect(monitor.list()).toEqual([]);
    expect(a.isShutdown()).toBe(true);
    expect(b.isShutdown()).toBe(true);
  });

  it("does not resurrect a reactor killed while it was provisioning", async () => {
    const monitor = registry();

    const pending = monitor.provision(descriptor("raced"));
    await monitor.kill("raced");

    await expect(pending).rejects.toThrow(/removed while it was provisioning/);
    expect(monitor.get("raced")).toBeUndefined();
  });

  it("hands back reactors that actually work", async () => {
    const monitor = registry();
    const reactor = await monitor.provision(descriptor("usable"));

    const created = await reactor.client.createEmpty(DRIVE_TYPE);

    expect((await reactor.client.get(created.header.id)).header.id).toBe(
      created.header.id,
    );
  });
});
