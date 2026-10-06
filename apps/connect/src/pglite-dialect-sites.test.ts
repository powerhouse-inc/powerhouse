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
});
