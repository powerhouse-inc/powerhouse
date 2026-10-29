import type { Action, Operation } from "@powerhousedao/shared/document-model";
import {
  compareCanonical,
  deriveOperationId,
  undo,
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

  it("keeps a stored versionless document's rules when a later batch's CREATE names 3", async () => {
    const { id, operations, later, earlier } = await sentHistory(2);
    const [create, upgrade, ...relationships] = operations;
    const legacyCreate = {
      ...create,
      action: {
        ...create.action,
        input: {
          ...(create.action.input as object),
          protocolVersions: undefined,
        },
      },
    } as Operation;
    const namingThree = {
      ...create,
      action: {
        ...create.action,
        input: {
          ...(create.action.input as object),
          protocolVersions: BASE_REDUCER_3_VERSIONS,
        },
      },
    } as Operation;
    const receiver = await createUndoV3ReactorBuilder().build();
    reactors.push(receiver);
    const first = await settled(
      receiver,
      (await receiver.load(id, "main", [legacyCreate, upgrade])).id,
    );
    expect(first.error?.message ?? first.status).toBe(JobStatus.READ_READY);
    expect((await receiver.get(id)).header.protocolVersions).toBe(undefined);

    const job = await settled(
      receiver,
      (await receiver.load(id, "main", [namingThree, ...relationships])).id,
    );

    expect(job.error?.message ?? job.status).toBe(JobStatus.READ_READY);
    expect(await storedDocumentRows(receiver, id)).toEqual([
      { index: 0, type: "CREATE_DOCUMENT", id: create.action.id },
      { index: 1, type: "UPGRADE_DOCUMENT", id: upgrade.action.id },
      { index: 2, type: "ADD_RELATIONSHIP", id: later },
      { index: 3, type: "ADD_RELATIONSHIP", id: earlier },
    ]);
    expect(await storedBaseReducer(receiver, id)).toBeUndefined();
  });

  // Only a document-scope UNDO can share a load with a CREATE.
  it.each([
    ["versionless", undefined],
    ["base-reducer 2", { "base-reducer": 2 }],
  ] as const)(
    "treats a loaded UNDO on a stored %s document the same when the batch's CREATE names 3",
    async (_label, storedVersions) => {
      const { id, operations } = await sentHistory(2);
      const [create, upgrade, ...relationships] = operations;
      const withVersions = (protocolVersions: unknown) =>
        ({
          ...create,
          action: {
            ...create.action,
            input: { ...(create.action.input as object), protocolVersions },
          },
        }) as Operation;
      const undone = {
        ...undo(1, "document"),
        timestampUtcMs: new Date(
          Date.parse(create.timestampUtcMs) + 3_000,
        ).toISOString(),
      };
      const loadUndo = async (createVersions: unknown) => {
        const receiver = await createUndoV3ReactorBuilder().build();
        reactors.push(receiver);
        const first = await settled(
          receiver,
          (
            await receiver.load(id, "main", [
              withVersions(storedVersions),
              upgrade,
            ])
          ).id,
        );
        expect(first.error?.message ?? first.status).toBe(JobStatus.READ_READY);
        const job = await settled(
          receiver,
          (
            await receiver.load(id, "main", [
              withVersions(createVersions),
              ...relationships,
              asOperation(id, undone, 4),
            ])
          ).id,
        );
        expect(await storedBaseReducer(receiver, id)).toBe(
          storedVersions?.["base-reducer"],
        );
        return { status: job.status, error: job.error?.name };
      };

      const namingThree = await loadUndo(BASE_REDUCER_3_VERSIONS);

      expect(namingThree.error).not.toBe("SubmittedUndoRefusedError");
      expect(namingThree).toEqual(await loadUndo(storedVersions));
    },
  );

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
