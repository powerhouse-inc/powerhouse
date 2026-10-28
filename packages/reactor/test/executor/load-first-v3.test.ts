import type { Action, Operation } from "@powerhousedao/shared/document-model";
import {
  compareCanonical,
  deriveOperationId,
} from "@powerhousedao/shared/document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addRelationshipAction } from "../../src/actions/index.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { IReactor } from "../../src/core/types.js";
import { JobStatus } from "../../src/shared/types.js";
import {
  BASE_REDUCER_3_VERSIONS,
  createDocModelDocument,
  createUndoV3ReactorBuilder,
} from "../factories.js";
import { documentModelDocumentModelModule } from "document-model";

// No stored header yet: the batch's CREATE_DOCUMENT names the version.
describe("the first load of a document", () => {
  const reactors: IReactor[] = [];

  afterEach(() => {
    for (const reactor of reactors.splice(0)) reactor.kill();
  });

  async function settled(reactor: IReactor, jobId: string) {
    await vi.waitUntil(
      async () => {
        const { status } = await reactor.getJobStatus(jobId);
        return status === JobStatus.READ_READY || status === JobStatus.FAILED;
      },
      { timeout: 5_000, interval: 10 },
    );
    return reactor.getJobStatus(jobId);
  }

  function asOperation(id: string, action: Action, index: number): Operation {
    return {
      id: deriveOperationId(id, action.scope, "main", action.id),
      index,
      skip: 0,
      hash: "",
      timestampUtcMs: action.timestampUtcMs,
      action,
    };
  }

  /** Creation, then two relationships whose indexes run against their timestamps. */
  async function sentHistory(baseReducer: 2 | 3) {
    const source = await createUndoV3ReactorBuilder().build();
    reactors.push(source);
    const document = createDocModelDocument({
      signaturePolicy: "legacy",
      protocolVersions:
        baseReducer === 3 ? BASE_REDUCER_3_VERSIONS : { "base-reducer": 2 },
    });
    const id = document.header.id;
    const created = await settled(source, (await source.create(document)).id);
    expect(created.error?.message ?? created.status).toBe(JobStatus.READ_READY);
    const [create, upgrade] = (
      await source.getOperations(id, { branch: "main", scopes: ["document"] })
    ).document!.results;
    expect([create.action.type, upgrade.action.type]).toEqual([
      "CREATE_DOCUMENT",
      "UPGRADE_DOCUMENT",
    ]);

    const createAction = { ...create.action, id: `~${create.action.id}` };
    const upgradeAction = {
      ...upgrade.action,
      timestampUtcMs: create.action.timestampUtcMs,
    };
    const base = Date.parse(create.timestampUtcMs);
    const later = {
      ...addRelationshipAction(id, "child-later", "child"),
      timestampUtcMs: new Date(base + 2_000).toISOString(),
    };
    const earlier = {
      ...addRelationshipAction(id, "child-earlier", "child"),
      timestampUtcMs: new Date(base + 1_000).toISOString(),
    };
    const operations = [
      asOperation(id, createAction, 0),
      asOperation(id, upgradeAction, 1),
      asOperation(id, later, 2),
      asOperation(id, earlier, 3),
    ];
    // Canonical order alone would put the UPGRADE ahead of its creation.
    expect(compareCanonical(operations[1], operations[0])).toBeLessThan(0);
    return { id, operations, later: later.id, earlier: earlier.id };
  }

  async function storedDocumentRows(reactor: IReactor, id: string) {
    return (
      await reactor.getOperations(id, { branch: "main", scopes: ["document"] })
    ).document!.results.map((operation) => ({
      index: operation.index,
      type: operation.action.type,
      id: operation.action.id,
    }));
  }

  async function storedBaseReducer(reactor: IReactor, id: string) {
    return (await reactor.get(id)).header.protocolVersions?.["base-reducer"];
  }

  it("runs base-reducer 3 load rules: canonical order, creation first", async () => {
    const { id, operations, later, earlier } = await sentHistory(3);
    const receiver = await createUndoV3ReactorBuilder().build();
    reactors.push(receiver);

    const job = await settled(
      receiver,
      (await receiver.load(id, "main", operations)).id,
    );

    expect(job.error?.message ?? job.status).toBe(JobStatus.READ_READY);
    expect(await storedDocumentRows(receiver, id)).toEqual([
      { index: 0, type: "CREATE_DOCUMENT", id: operations[0].action.id },
      { index: 1, type: "UPGRADE_DOCUMENT", id: operations[1].action.id },
      { index: 2, type: "ADD_RELATIONSHIP", id: earlier },
      { index: 3, type: "ADD_RELATIONSHIP", id: later },
    ]);
    expect(await storedBaseReducer(receiver, id)).toBe(3);
  });

  it("keeps the sender's index order for a base-reducer 2 document", async () => {
    const { id, operations, later, earlier } = await sentHistory(2);
    const receiver = await createUndoV3ReactorBuilder().build();
    reactors.push(receiver);

    const job = await settled(
      receiver,
      (await receiver.load(id, "main", operations)).id,
    );

    expect(job.error?.message ?? job.status).toBe(JobStatus.READ_READY);
    expect(await storedDocumentRows(receiver, id)).toEqual([
      { index: 0, type: "CREATE_DOCUMENT", id: operations[0].action.id },
      { index: 1, type: "UPGRADE_DOCUMENT", id: operations[1].action.id },
      { index: 2, type: "ADD_RELATIONSHIP", id: later },
      { index: 3, type: "ADD_RELATIONSHIP", id: earlier },
    ]);
    expect(await storedBaseReducer(receiver, id)).toBe(2);
  });

  it("refuses a base-reducer 3 creation on a receiver without undoV3", async () => {
    const { id, operations } = await sentHistory(3);
    const receiver = await new ReactorBuilder()
      .withDocumentModelSources([documentModelDocumentModelModule as never])
      .build();
    reactors.push(receiver);

    const job = await settled(
      receiver,
      (await receiver.load(id, "main", operations)).id,
    );

    expect(job.status).toBe(JobStatus.FAILED);
    expect(job.error?.name).toBe("UnsupportedProtocolVersionError");
    await expect(receiver.get(id)).rejects.toThrow();
  });
});
