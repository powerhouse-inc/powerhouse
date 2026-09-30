import { PGlite } from "@electric-sql/pglite";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  generateId,
  withSignaturePolicy,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule, setModelName } from "document-model";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { expect, it, vi } from "vitest";
import { ReactorBuilder } from "../../../src/core/reactor-builder.js";
import { JobStatus } from "../../../src/shared/types.js";
import { createDocModelDocument } from "../../factories.js";

const JOBS = 20;

type Segment = { lookups: number; locks: number };

// PGlite runs one transaction at a time, so each begin..commit is one trx.
function jobSegments(statements: string[]): Segment[] {
  const segments: Segment[] = [];
  let current: string[] | undefined;
  for (const statement of statements) {
    const text = statement.trim().toLowerCase();
    if (text === "begin") {
      current = [];
      continue;
    }
    if (text === "commit" || text === "rollback") {
      if (
        current?.some((s) => s.includes('insert into "reactor"."operation"')) &&
        !current.some((s) => s.includes('"reactor"."keyframe"'))
      ) {
        segments.push({
          lookups: current.filter((s) => s.includes("document_purges")).length,
          locks: current.filter((s) => s.includes("pg_advisory_xact_lock"))
            .length,
        });
      }
      current = undefined;
      continue;
    }
    current?.push(text);
  }
  return segments;
}

it("reads each job's tombstones once, under its one lock statement", async () => {
  const statements: string[] = [];
  let capture = false;
  const db = new Kysely<any>({
    dialect: new PGliteDialect(new PGlite()),
    log: (event) => {
      if (capture) statements.push(event.query.sql);
    },
  });
  const module = await new ReactorBuilder()
    .withKysely(db)
    .withDocumentModelSources([
      documentModelDocumentModelModule as never,
      driveDocumentModelModule as never,
    ])
    .buildModule();
  const reactor = module.reactor;
  const settle = (id: string) =>
    vi.waitUntil(
      async () => {
        const status = (await reactor.getJobStatus(id)).status;
        return status === JobStatus.READ_READY || status === JobStatus.FAILED;
      },
      { timeout: 10_000, interval: 5 },
    );
  try {
    const document = withSignaturePolicy(createDocModelDocument(), "legacy", {
      id: generateId(),
    });
    await settle((await reactor.create(document)).id);
    await settle(
      (
        await reactor.execute(document.header.id, "main", [
          setModelName({ name: "warm" }),
        ])
      ).id,
    );
    capture = true;
    for (let i = 0; i < JOBS; i++) {
      await settle(
        (
          await reactor.execute(document.header.id, "main", [
            setModelName({ name: `n${i}` }),
          ])
        ).id,
      );
    }
    capture = false;

    const segments = jobSegments(statements);
    expect(segments.length).toBeGreaterThanOrEqual(JOBS - 2);
    expect(new Set(segments.map((s) => JSON.stringify(s)))).toEqual(
      new Set([JSON.stringify({ lookups: 1, locks: 1 })]),
    );
  } finally {
    await reactor.kill().completed;
  }
}, 60_000);
