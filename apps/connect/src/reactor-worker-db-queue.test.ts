import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The worker's two PGlite stores each have ONE session, shared by everything
 * that touches them. SQL issued straight at the client enters neither the
 * dialect's serialising queue nor any transaction boundary, so it lands inside
 * whatever transaction is open on that session: it reads uncommitted rows, and
 * an erroring statement aborts that transaction outright - which is how SQL
 * typed into the DB explorer could erase a job's writes. See
 * docs/bugs/2026-10-03-sync-defect-analysis.md, mechanism A-3.
 *
 * Both RPC query handlers therefore go through `queryThroughDialect` over the
 * store's own Kysely: the reactor store's (`owned.reactorDb`) and the
 * relational store's (`relational.kysely`, wrapped by the same
 * HardenedPGliteDialect the relational processors write through).
 *
 * Static assertion, because the handlers are closures inside the worker's
 * top-level `new ReactorHost({...})` - importing the module to reach them
 * would boot the worker.
 */
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
