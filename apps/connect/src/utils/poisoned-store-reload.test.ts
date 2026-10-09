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

  it("is what the worker hands both of its stores", () => {
    const worker = readFileSync(
      fileURLToPath(new URL("../reactor.worker.ts", import.meta.url)),
      "utf8",
    );
    const dialects = [
      ...worker.matchAll(/new HardenedPGliteDialect\(([\s\S]*?)\)/g),
    ];
    expect(dialects).toHaveLength(1);
    expect(dialects[0]?.[0]).toMatch(/onPoisoned: onStorePoisoned/);
    const groupCommit = [
      ...worker.matchAll(/\.withGroupCommitPGlite\(\{([\s\S]*?)\}\)/g),
    ];
    expect(groupCommit).toHaveLength(1);
    expect(groupCommit[0]?.[0]).toMatch(/onUnrecoverable: onStorePoisoned/);
    expect(worker).toMatch(
      /const onStorePoisoned = reloadOnPoisonedStore\(\s*\(reason, gen\) =>\s*host\.retireAndReload\(reason, gen\)/,
    );
  });
});
