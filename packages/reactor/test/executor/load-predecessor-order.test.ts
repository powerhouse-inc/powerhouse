import type {
  Action,
  DocumentModelDocument,
  Operation,
} from "@powerhousedao/shared/document-model";
import {
  addModule,
  deriveOperationId,
  garbageCollect,
  sortOperations,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, describe, expect, it } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { InProcessReactorModule } from "../../src/core/types.js";
import { JobStatus, type JobInfo } from "../../src/shared/types.js";
import { createDocModelDocument } from "../factories.js";

// After reshuffles a peer's indexes say nothing about this reactor's order.
describe("a load whose remote indexes run ahead of the local log", () => {
  let module: InProcessReactorModule | undefined;
  let docId: string;
  let base: number;

  afterEach(() => {
    module?.reactor.kill();
    module = undefined;
  });

  async function build(): Promise<void> {
    module = await new ReactorBuilder()
      .withDocumentModelSources([documentModelDocumentModelModule as never])
      .buildModule();
    const document = createDocModelDocument({ signaturePolicy: "legacy" });
    docId = document.header.id;
    const created = await settle(await module.reactor.create(document));
    expect(created.error?.message ?? created.status).toBe(JobStatus.READ_READY);
    base = Date.now() + 60_000;
  }

  async function settle(job: JobInfo): Promise<JobInfo> {
    let status = await module!.reactor.getJobStatus(job.id);
    while (
      status.status !== JobStatus.READ_READY &&
      status.status !== JobStatus.FAILED
    ) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      status = await module!.reactor.getJobStatus(job.id);
    }
    return status;
  }

  function moduleAction(id: string, offsetMs: number): Action {
    return {
      ...addModule({ id, name: id }),
      timestampUtcMs: new Date(base + offsetMs).toISOString(),
    };
  }

  function asOperation(action: Action, index: number, skip = 0): Operation {
    return {
      id: deriveOperationId(docId, action.scope, "main", action.id),
      index,
      skip,
      hash: "",
      timestampUtcMs: action.timestampUtcMs,
      action,
    };
  }

  async function run(job: Promise<JobInfo>): Promise<void> {
    const settled = await settle(await job);
    expect(settled.error?.message ?? settled.status).toBe(JobStatus.READ_READY);
  }

  async function live(): Promise<string[]> {
    const result = (await module!.reactor.getOperations(docId, {
      branch: "main",
      scopes: ["global"],
    })) as Record<string, { results: Operation[] } | undefined>;
    return garbageCollect(sortOperations(result.global?.results ?? [])).map(
      (operation) => (operation.action.input as { id: string }).id,
    );
  }

  async function modules(): Promise<string[]> {
    const document = await module!.reactor.get<DocumentModelDocument>(docId);
    return document.state.global.specifications[0].modules.map(
      (entry) => entry.id,
    );
  }

  it("places a late operation stamped before local ones ahead of them", async () => {
    await build();
    const s1 = moduleAction("s1", 100);
    const s2 = moduleAction("s2", 110);
    const s3 = moduleAction("s3", 150);
    const x1 = moduleAction("x1", 426);
    const x2 = moduleAction("x2", 427);

    await run(module!.reactor.execute(docId, "main", [x1, x2]));
    await run(
      module!.reactor.load(docId, "main", [
        asOperation(s1, 951),
        asOperation(s2, 952),
      ]),
    );
    expect(await live()).toEqual(["s1", "s2", "x1", "x2"]);

    // The rest of the peer's batch, alone, at the peer's next index.
    await run(module!.reactor.load(docId, "main", [asOperation(s3, 953)]));

    expect(await live()).toEqual(["s1", "s2", "s3", "x1", "x2"]);
    expect(await modules()).toEqual(["s1", "s2", "s3", "x1", "x2"]);

    // The peer's canonical order, re-delivered, changes nothing.
    await run(
      module!.reactor.load(docId, "main", [
        asOperation(s1, 1065),
        asOperation(s2, 1066),
        asOperation(s3, 1067),
        asOperation(x1, 1068),
        asOperation(x2, 1069),
      ]),
    );
    expect(await live()).toEqual(["s1", "s2", "s3", "x1", "x2"]);
    expect(await modules()).toEqual(["s1", "s2", "s3", "x1", "x2"]);
  });
});
