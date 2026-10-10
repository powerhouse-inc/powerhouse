import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Static, because the handlers are closures in the worker's top-level ReactorHost.
const WORKER = fileURLToPath(new URL("./reactor.worker.ts", import.meta.url));

describe("reactor.worker RPC db queries", () => {
  const source = readFileSync(WORKER, "utf8");

  it("routes both store query RPCs through the dialect queue", () => {
    const routed = source.match(/queryThroughDialect\(/g) ?? [];
    expect(routed.length).toBe(2);
  });

  it("never issues RPC SQL at a raw PGlite client", () => {
    const offenders = [
      ...source.matchAll(/(?:relational|owned)\.(?:pg|reactorPg)\.query\(/g),
    ].map((match) => match[0]);
    expect(offenders).toEqual([]);
  });
});
