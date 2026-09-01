import { documentModelDocumentModelModule } from "document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { InProcessReactorModule } from "../../src/core/types.js";
import { JobStatus } from "../../src/shared/types.js";

/**
 * Mechanism harness for the .phd re-import id-collision defect.
 *
 * Two stores answer "does this document exist" and they can disagree: the read
 * side throws off missing DocumentSnapshot rows (src/read-models/document-view.ts),
 * while the write side validates against the Operation head
 * (src/storage/kysely/store.ts). The import path in reactor-browser
 * (src/actions/document.ts ~703) asks the read side and swallows the throw, so a
 * stream with no snapshot row gets its id reused and the write is rejected.
 *
 * The first test does not invert on a fix: the view legitimately throws for an
 * absent snapshot, and the store legitimately rejects a reused id. The import
 * path's decision logic is what has to change there, and this file only copies
 * it inline (see the fail-open catch below) rather than calling it.
 *
 * The second test is a regression test. A reused id now fails as
 * DocumentAlreadyExistsError on the first attempt instead of surfacing an
 * overloaded RevisionMismatchError four retries deep, so a caller can tell
 * "mint a new id" apart from "re-read and retry".
 *
 * How the snapshot row goes missing in production is out of scope; it is
 * manufactured here.
 */
describe("DEFECT: DocumentSnapshot read model diverges from the Operation store", () => {
  const modules: InProcessReactorModule[] = [];

  async function boot(): Promise<InProcessReactorModule> {
    const module = await new ReactorBuilder()
      .withDocumentModelSources([documentModelDocumentModelModule])
      .buildModule();
    modules.push(module);
    return module;
  }

  /** Resolves once the job reaches a terminal status (READ_READY or FAILED). */
  async function waitForTerminal(
    module: InProcessReactorModule,
    jobId: string,
  ) {
    await vi.waitUntil(
      async () => {
        const status = await module.reactor.getJobStatus(jobId);
        return (
          status.status === JobStatus.READ_READY ||
          status.status === JobStatus.FAILED
        );
      },
      { timeout: 15000, interval: 25 },
    );
    return await module.reactor.getJobStatus(jobId);
  }

  afterEach(async () => {
    for (const module of modules.splice(0)) {
      await module.reactor.kill().completed;
    }
  });

  it("DEFECT: reports a document as absent through reactor.get while its operation stream is intact", async () => {
    const module = await boot();

    const document = documentModelDocumentModelModule.utils.createDocument();
    const created = await waitForTerminal(
      module,
      (await module.reactor.create(document)).id,
    );
    expect(created.status).toBe(JobStatus.READ_READY);

    const documentId = document.header.id;
    await expect(module.reactor.get(documentId)).resolves.toMatchObject({
      header: { id: documentId },
    });

    const deleted = await module.database
      .deleteFrom("DocumentSnapshot")
      .where("documentId", "=", documentId)
      .executeTakeFirst();
    expect(Number(deleted.numDeletedRows)).toBeGreaterThan(0);

    const remainingOperations = await module.database
      .selectFrom("Operation")
      .selectAll()
      .where("documentId", "=", documentId)
      .execute();
    expect(remainingOperations.length).toBeGreaterThan(0);

    await expect(module.reactor.get(documentId)).rejects.toThrow(
      `Document not found: ${documentId}`,
    );

    expect(
      remainingOperations
        .filter((op) => op.scope === "document")
        .map((op) => op.index),
    ).toContain(0);
  });

  it("DEFECT: rejects a CREATE_DOCUMENT that reuses the id the read model claims is free", async () => {
    const module = await boot();

    const original = documentModelDocumentModelModule.utils.createDocument();
    const created = await waitForTerminal(
      module,
      (await module.reactor.create(original)).id,
    );
    expect(created.status).toBe(JobStatus.READ_READY);

    const documentId = original.header.id;
    await module.database
      .deleteFrom("DocumentSnapshot")
      .where("documentId", "=", documentId)
      .execute();

    // Verbatim shape of the import path's fail-open existence check.
    let duplicateId = false;
    try {
      await module.reactor.get(documentId);
      duplicateId = true;
    } catch {
      // document id not found
    }
    expect(duplicateId).toBe(false);

    const imported = documentModelDocumentModelModule.utils.createDocument();
    imported.header.id = duplicateId ? imported.header.id : documentId;
    imported.header.name = "imported copy";
    expect(imported.header.id).toBe(documentId);

    const importJob = await module.reactor.create(imported);
    const terminal = await waitForTerminal(module, importJob.id);

    expect(terminal.status).toBe(JobStatus.FAILED);
    expect(terminal.error?.name).toBe("DocumentAlreadyExistsError");
    expect(terminal.error?.message).toContain(documentId);
    expect(terminal.error?.message).toContain("already exists");

    // One attempt, not five: retrying a taken id can never succeed, so the
    // aggregated "Job failed after N attempts" history never forms.
    expect(terminal.error?.message).not.toContain("attempts");
  });
});
