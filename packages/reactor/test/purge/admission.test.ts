import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import { afterEach, describe, expect, it } from "vitest";
import type { InProcessReactorModule } from "../../src/core/types.js";
import {
  JobExecutorEventTypes,
  type JobStartedEvent,
} from "../../src/executor/types.js";
import type { Job } from "../../src/queue/types.js";
import { JobStatus } from "../../src/shared/types.js";
import { KyselyDocumentPurger } from "../../src/storage/kysely/document-purger.js";
import { createDocModelDocument } from "../factories.js";
import {
  addChild,
  buildReactor,
  createDocument,
  createDrive,
  deleteDocument,
  emptyRows,
  renameDocument,
  rowsAbout,
  settle,
  storedOperations,
} from "./helpers.js";

const directive = { directiveId: "admission-test" };

describe("admission of a purged document", () => {
  const modules: InProcessReactorModule[] = [];

  async function reactor(documentDecisions = false) {
    const module = await buildReactor({ featureFlags: { documentDecisions } });
    modules.push(module);
    return module;
  }

  function countStarts(module: InProcessReactorModule): Map<string, number> {
    const starts = new Map<string, number>();
    module.eventBus.subscribe<JobStartedEvent>(
      JobExecutorEventTypes.JOB_STARTED,
      (_type, event) => {
        starts.set(event.job.id, (starts.get(event.job.id) ?? 0) + 1);
      },
    );
    return starts;
  }

  afterEach(() => {
    for (const module of modules.splice(0)) module.reactor.kill();
  });

  it("refuses CREATE_DOCUMENT for a tombstoned id, once", async () => {
    const module = await reactor();
    const starts = countStarts(module);
    await new KyselyDocumentPurger(module.database).purge(["gone"], directive);

    const job = await module.reactor.create(
      createDocModelDocument({ id: "gone" }),
    );
    const info = await settle(module.reactor, job);

    expect(info.status).toBe(JobStatus.FAILED);
    expect(info.error?.name).toBe("DocumentPurgedError");
    expect(starts.get(job.id)).toBe(1);
    expect(await rowsAbout(module.database, "gone")).toEqual(emptyRows());
  });

  describe.each([false, true])("with documentDecisions %s", (decisions) => {
    it("refuses a load, even past a stale deleted meta in the cache", async () => {
      const module = await reactor(decisions);
      const starts = countStarts(module);
      await createDocument(module, "doc");
      await renameDocument(module, "doc", "before");
      await deleteDocument(module, "doc");
      const history = await storedOperations(module, "doc");

      // The meta cache still holds the deleted document: nothing evicts it here.
      await new KyselyDocumentPurger(module.database).purge(["doc"], directive);

      for (const [scope, operations] of Object.entries(history)) {
        const job = await module.reactor.load("doc", "main", operations);
        const info = await settle(module.reactor, job);
        expect({ scope, status: info.status, name: info.error?.name }).toEqual({
          scope,
          status: JobStatus.FAILED,
          name: "DocumentPurgedError",
        });
        expect(starts.get(job.id)).toBe(1);
      }

      await module.readModelCoordinator.drain();
      expect(await rowsAbout(module.database, "doc")).toEqual(emptyRows());
    });
  });

  it("refuses a reevaluation job", async () => {
    const module = await reactor(true);
    await createDocument(module, "judged");
    await deleteDocument(module, "judged");
    await new KyselyDocumentPurger(module.database).purge(
      ["judged"],
      directive,
    );

    const job: Job = {
      id: "reevaluate-judged",
      kind: "reevaluation",
      documentId: "judged",
      scope: "global",
      branch: "main",
      actions: [],
      operations: [],
      createdAt: new Date().toISOString(),
      queueHint: [],
      maxRetries: 3,
      errorHistory: [],
      meta: { batchId: "b", batchJobIds: ["reevaluate-judged"] },
    };
    const [executor] = module.executorManager.getExecutors();
    const result = await executor!.executeJob(job);

    expect(result.success).toBe(false);
    expect(result.error?.name).toBe("DocumentPurgedError");
  });

  it("refuses ADD_RELATIONSHIP to a tombstoned target on the write path", async () => {
    const module = await reactor();
    await createDrive(module, "parent");
    await new KyselyDocumentPurger(module.database).purge(
      ["target"],
      directive,
    );

    const job = await module.reactor.addRelationship(
      "parent",
      "target",
      "child",
    );
    const info = await settle(module.reactor, job);

    expect(info.status).toBe(JobStatus.FAILED);
    expect(info.error?.name).toBe("DocumentPurgedError");
    expect(await rowsAbout(module.database, "target")).toEqual(emptyRows());
  });

  it("accepts ADD_RELATIONSHIP to a tombstoned target on load, without membership or index rows", async () => {
    const source = await reactor();
    await createDrive(source, "parent");
    await createDocument(source, "target");
    await addChild(source, "parent", "target");
    const history = await storedOperations(source, "parent");

    const module = await reactor();
    await new KyselyDocumentPurger(module.database).purge(
      ["target"],
      directive,
    );

    for (const operations of Object.values(history)) {
      const info = await settle(
        module.reactor,
        await module.reactor.load("parent", "main", operations),
      );
      expect(info.status).toBe(JobStatus.READ_READY);
    }
    await module.readModelCoordinator.drain();

    const stored = await storedOperations(module, "parent");
    expect(
      stored.document.some((op) => op.action.type === "ADD_RELATIONSHIP"),
    ).toBe(true);
    expect(await rowsAbout(module.database, "target")).toEqual(emptyRows());
    const drive = await module.reactor.get("parent");
    expect(drive.header.documentType).toBe(
      driveDocumentModelModule.documentModel.global.id,
    );
  });
});
