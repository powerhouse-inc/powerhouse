import { PGlite } from "@electric-sql/pglite";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { InProcessReactorModule } from "../../src/core/types.js";
import { JobStatus } from "../../src/shared/types.js";
import type { GroupCommitPGliteInstance } from "../../src/storage/kysely/group-commit-pglite-client.js";
import { createDocModelDocument } from "../factories.js";

type Controlled = GroupCommitPGliteInstance & {
  pg: PGlite;
  syncs: number;
  hangNext: RegExp | undefined;
  delayNext: { pattern: RegExp; ms: number } | undefined;
  /** Every sync waits for this first. */
  syncHold: Promise<void> | undefined;
};

/** A real PGlite whose next matching statement can be delayed or made to never settle. */
function controlled(pg: PGlite): Controlled {
  const instance: Controlled = {
    pg,
    syncs: 0,
    hangNext: undefined,
    delayNext: undefined,
    syncHold: undefined,
    query: async (text, params) => {
      if (instance.hangNext?.test(text) === true) {
        instance.hangNext = undefined;
        return new Promise(() => undefined);
      }
      const delayed = instance.delayNext;
      if (delayed?.pattern.test(text) === true) {
        instance.delayNext = undefined;
        await new Promise((resolve) => setTimeout(resolve, delayed.ms));
      }
      return pg.query(text, params);
    },
    exec: (text) => pg.exec(text),
    isInTransaction: () => pg.isInTransaction(),
    close: () => pg.close(),
    syncToFs: async () => {
      instance.syncs += 1;
      await instance.syncHold;
      return pg.syncToFs();
    },
  };
  return instance;
}

const MODELS = [
  documentModelDocumentModelModule as unknown as DocumentModelModule,
];

describe("ReactorBuilder.withGroupCommitPGlite", () => {
  const dirs: string[] = [];
  const modules: InProcessReactorModule[] = [];

  afterEach(async () => {
    for (const module of modules.splice(0)) {
      module.reactor.kill();
      await module.groupCommitStorage?.close().catch(() => undefined);
    }
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  async function openFresh(): Promise<Controlled> {
    const dir = mkdtempSync(join(tmpdir(), "group-commit-builder-"));
    dirs.push(dir);
    const pg = new PGlite(dir);
    await pg.waitReady;
    return controlled(pg);
  }

  function builderOver(pg: Controlled, unrecoverable: Error[]): ReactorBuilder {
    return new ReactorBuilder()
      .withDocumentModelSources(MODELS)
      .withExecutorConfig({ signatureVerification: "log" })
      .withGroupCommitPGlite({
        pg,
        onUnrecoverable: (cause) => void unrecoverable.push(cause),
        onDiagnostic: () => undefined,
        dialect: { statementTimeoutMs: 300, recoveryTimeoutMs: 300 },
        client: { closeTimeoutMs: 500 },
      });
  }

  async function settled(
    module: InProcessReactorModule,
    jobId: string,
  ): Promise<void> {
    await vi.waitFor(async () => {
      const info = await module.reactor.getJobStatus(jobId);
      expect(info.status).toBe(JobStatus.READ_READY);
    });
  }

  it("refuses a store with no onUnrecoverable", async () => {
    const pg = controlled(new PGlite());
    const builder = new ReactorBuilder().withGroupCommitPGlite({
      pg,
    } as never);
    await expect(builder.buildModule()).rejects.toThrow(/onUnrecoverable/);
    await pg.pg.close();
  });

  it("refuses to share the database with withKysely", async () => {
    const pg = controlled(new PGlite());
    const builder = new ReactorBuilder()
      .withKysely({} as never)
      .withGroupCommitPGlite({ pg, onUnrecoverable: () => undefined });
    await expect(builder.buildModule()).rejects.toThrow(/withKysely/);
    await pg.pg.close();
  });

  it("refuses a worker pool, whose workers never see the embedded store", async () => {
    const pg = controlled(new PGlite());
    const builder = new ReactorBuilder()
      .withWorkerPool({ numWorkers: 1 } as never)
      .withGroupCommitPGlite({ pg, onUnrecoverable: () => undefined });
    await expect(builder.buildModule()).rejects.toThrow(/withWorkerPool/);
    await pg.pg.close();
  });

  it("refuses a caller-supplied executor, which would not flush", async () => {
    const pg = controlled(new PGlite());
    const builder = new ReactorBuilder()
      .withExecutor({} as never)
      .withGroupCommitPGlite({ pg, onUnrecoverable: () => undefined });
    await expect(builder.buildModule()).rejects.toThrow(/withExecutor/);
    await pg.pg.close();
  });

  it("refuses a job timeout the durability wait could outlast", async () => {
    const pg = controlled(new PGlite());
    const builder = new ReactorBuilder()
      .withExecutorConfig({ jobTimeoutMs: 200_000 })
      .withGroupCommitPGlite({ pg, onUnrecoverable: () => undefined });
    await expect(builder.buildModule()).rejects.toThrow(/jobTimeoutMs/);
    await pg.pg.close();
  });

  it("never fails a committed job whose flush outlasts the job timeout but not the durability wait", async () => {
    const pg = await openFresh();
    const jobTimeoutMs = 2_100;
    const module = await new ReactorBuilder()
      .withDocumentModelSources(MODELS)
      .withExecutorConfig({
        signatureVerification: "log",
        durabilityWaitMs: 2_000,
        jobTimeoutMs,
      })
      .withGroupCommitPGlite({
        pg,
        onUnrecoverable: () => undefined,
        onDiagnostic: () => undefined,
        dialect: { statementTimeoutMs: 10_000, recoveryTimeoutMs: 10_000 },
        client: { closeTimeoutMs: 500 },
      })
      .buildModule();
    modules.push(module);

    const started = Date.now();
    pg.delayNext = { pattern: /insert into \S*"Operation"/i, ms: 1_000 };
    pg.syncHold = new Promise((resolve) =>
      setTimeout(resolve, jobTimeoutMs + 300),
    );
    const job = await module.reactor.create(createDocModelDocument());

    const seen = new Set<JobStatus>();
    await vi.waitFor(
      async () => {
        const info = await module.reactor.getJobStatus(job.id);
        seen.add(info.status);
        expect([JobStatus.READ_READY, JobStatus.FAILED]).toContain(info.status);
      },
      { timeout: 8_000, interval: 20 },
    );
    expect(Date.now() - started).toBeGreaterThan(jobTimeoutMs);
    expect(seen).not.toContain(JobStatus.FAILED);
  });

  it("flushes before a job is announced", async () => {
    const pg = await openFresh();
    const module = await builderOver(pg, []).buildModule();
    modules.push(module);

    const before = pg.syncs;
    const job = await module.reactor.create(createDocModelDocument());
    await settled(module, job.id);
    expect(pg.syncs).toBeGreaterThan(before);
  });

  it("hands a poisoned session to onUnrecoverable once and never reuses it", async () => {
    const pg = await openFresh();
    const unrecoverable: Error[] = [];
    const module = await builderOver(pg, unrecoverable).buildModule();
    modules.push(module);

    pg.hangNext = /select/i;
    await expect(
      module.reactor.find({ type: "powerhouse/document-model" }),
    ).rejects.toThrow();
    await module.reactor
      .find({ type: "powerhouse/document-model" })
      .catch(() => undefined);

    expect(unrecoverable).toHaveLength(1);
    expect(module.groupCommitStorage?.health.getStorageHealth()).toEqual({
      healthy: false,
    });
  });

  it("hands a poison during build to onUnrecoverable", async () => {
    const pg = await openFresh();
    const unrecoverable: Error[] = [];
    pg.hangNext = /^select/i;
    await expect(
      builderOver(pg, unrecoverable).buildModule(),
    ).rejects.toThrow();
    expect(unrecoverable).toHaveLength(1);
  });
});
