import { describe, expect, it } from "vitest";
import { adoptWorkerGen, readWorkerGen } from "./reactor-worker-name.js";

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

describe("adoptWorkerGen", () => {
  it("moves the gen on from the one this tab's worker runs as", () => {
    const storage = memoryStorage();
    adoptWorkerGen("ns", null, "g1", storage);
    adoptWorkerGen("ns", "g1", "g2", storage);
    expect(readWorkerGen("ns", storage)).toBe("g2");
  });

  it("never writes a stale worker's gen over a newer one", () => {
    const storage = memoryStorage();
    adoptWorkerGen("ns", null, "g1", storage);
    adoptWorkerGen("ns", "g1", "g2", storage);
    adoptWorkerGen("ns", "g2", "g3", storage);
    // A tab still on retired g1 is sent to the g2 that g1 retired into.
    adoptWorkerGen("ns", "g1", "g2", storage);
    expect(readWorkerGen("ns", storage)).toBe("g3");
  });
});
