import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { reloadOnPoisonedStore } from "./poisoned-store-reload.js";

describe("reloadOnPoisonedStore", () => {
  it("reloads every tab onto a fresh worker, once", () => {
    const broadcast = vi.fn();
    const onPoisoned = reloadOnPoisonedStore(broadcast);

    onPoisoned(new Error("dead call"));
    onPoisoned(new Error("second store"));

    expect(broadcast).toHaveBeenCalledOnce();
    const [reason, gen] = broadcast.mock.calls[0] as [string, string];
    expect(reason).toMatch(/poisoned/);
    expect(gen).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("is what the worker hands both of its stores' dialects", () => {
    const worker = readFileSync(
      fileURLToPath(new URL("../reactor.worker.ts", import.meta.url)),
      "utf8",
    );
    const dialects = [
      ...worker.matchAll(/new HardenedPGliteDialect\(([\s\S]*?)\)/g),
    ];
    expect(dialects).toHaveLength(2);
    for (const [call] of dialects) {
      expect(call).toMatch(/onPoisoned: onStorePoisoned/);
    }
    expect(worker).toMatch(
      /const onStorePoisoned = reloadOnPoisonedStore\(\s*\(reason, gen\) =>\s*host\.retire\(reason, gen\)/,
    );
  });
});
