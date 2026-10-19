import { describe, expect, it } from "vitest";
import { warmModules } from "../src/warm-modules.js";

describe("warmModules", () => {
  it("runs each stage in its own task, in order", async () => {
    const log: string[] = [];
    let tasks = 0;
    const counter = setInterval(() => tasks++, 0);
    const stage = (name: string) => () => {
      log.push(`${name}@${tasks}`);
      return Promise.resolve();
    };
    await warmModules([stage("a"), stage("b")]);
    clearInterval(counter);
    expect(log.map((entry) => entry.split("@")[0])).toEqual(["a", "b"]);
    const [a, b] = log.map((entry) => Number(entry.split("@")[1]));
    expect(b).toBeGreaterThan(a);
  });

  it("keeps going when a stage fails to load", async () => {
    const log: string[] = [];
    await warmModules([
      () => Promise.reject(new Error("offline")),
      () => {
        log.push("b");
        return Promise.resolve();
      },
    ]);
    expect(log).toEqual(["b"]);
  });

  // Cold imports of the real packages: slow CI runners need more than 5s.
  it("evaluates the real packages", { timeout: 60_000 }, async () => {
    await expect(warmModules()).resolves.toBeUndefined();
  });
});
