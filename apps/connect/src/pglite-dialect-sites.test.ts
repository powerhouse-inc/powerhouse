import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = (file: string) =>
  readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8");

describe("connect's own pglite stores", () => {
  it("build the relational store on the hardened dialect", () => {
    const db = source("./pglite.db.ts");
    expect(db).not.toMatch(/new PGliteDialect\(/);
    expect(db).toMatch(/new HardenedPGliteDialect\(/);
  });

  it("hand both in-tab dialects the bounded page reload for a poisoned session", () => {
    for (const file of ["./pglite.db.ts", "./utils/reactor.ts"]) {
      const calls = [
        ...source(file).matchAll(/new HardenedPGliteDialect\(([\s\S]*?)\)/g),
      ];
      expect(calls.length, file).toBeGreaterThan(0);
      for (const [call] of calls) {
        expect(call, file).toMatch(/onPoisoned: reloadPageForPoisonedStore/);
      }
    }
  });
});

describe("the reactor worker's idb stores", () => {
  it("open only under the store's exclusive lock", () => {
    const worker = source("./reactor.worker.ts");
    const opens = [...worker.matchAll(/new PGlite\(`idb:\/\//g)];
    expect(opens.length).toBeGreaterThan(0);
    for (const open of opens) {
      const before = worker.slice(0, open.index);
      const opener = before.slice(before.lastIndexOf("async function "));
      expect(opener).toMatch(/await storeLocks\.acquire\(/);
    }
  });
});
