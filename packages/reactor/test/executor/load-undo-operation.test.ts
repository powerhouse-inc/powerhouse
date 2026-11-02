import type { Action, Operation } from "@powerhousedao/shared/document-model";
import {
  addModule,
  deriveOperationId,
  undo,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addRelationshipAction } from "../../src/actions/index.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { IReactor } from "../../src/core/types.js";
import { JobStatus } from "../../src/shared/types.js";
import {
  createDocModelDocument,
  createUndoV3ReactorBuilder,
} from "../factories.js";

const builders = {
  "undoV3 on": () => createUndoV3ReactorBuilder(),
  "undoV3 off": () =>
    new ReactorBuilder()
      .withDocumentModelSources([documentModelDocumentModelModule as never])
      .withExecutorConfig({ featureFlags: { undoV3: false } }),
};

// Base-reducer 1 and 2 store an undo as a NOOP marker, never as an UNDO row.
describe.each(Object.entries(builders))(
  "a loaded UNDO operation (%s)",
  (_label, builder) => {
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
        { timeout: 10_000, interval: 10 },
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

    async function rows(reactor: IReactor, id: string, scope: string) {
      const result = await reactor.getOperations(id, {
        branch: "main",
        scopes: [scope],
      });
      return (
        (result as Record<string, { results: Operation[] } | undefined>)[scope]
          ?.results ?? []
      ).map((operation) => `${operation.index}:${operation.action.type}`);
    }

    /** A stored document on the receiver, and the creation it was loaded from. */
    async function receiverWith(baseReducer: 1 | 2) {
      const source = await builder().build();
      reactors.push(source);
      const document = createDocModelDocument({
        signaturePolicy: "legacy",
        protocolVersions: { "base-reducer": baseReducer },
      });
      const id = document.header.id;
      const created = await settled(source, (await source.create(document)).id);
      expect(created.error?.message ?? created.status).toBe(
        JobStatus.READ_READY,
      );
      const [create, upgrade] = (
        await source.getOperations(id, { branch: "main", scopes: ["document"] })
      ).document!.results;

      const receiver = await builder().build();
      reactors.push(receiver);
      const first = await settled(
        receiver,
        (await receiver.load(id, "main", [create, upgrade])).id,
      );
      expect(first.error?.message ?? first.status).toBe(JobStatus.READ_READY);
      expect(
        (await receiver.get(id)).header.protocolVersions?.["base-reducer"],
      ).toBe(baseReducer);
      return { receiver, id, create, base: Date.parse(create.timestampUtcMs) };
    }

    const at = (base: number, offset: number) =>
      new Date(base + offset).toISOString();

    async function expectRefused(
      receiver: IReactor,
      id: string,
      operations: Operation[],
    ) {
      const job = await settled(
        receiver,
        (await receiver.load(id, "main", operations)).id,
      );
      expect(job.status).toBe(JobStatus.FAILED);
      expect(job.error?.name).toBe("UndoOperationRefusedError");
    }

    describe.each([1, 2] as const)("on base-reducer %i", (baseReducer) => {
      it("refuses a document-scope UNDO", async () => {
        const { receiver, id, base } = await receiverWith(baseReducer);
        const relationship = asOperation(
          id,
          {
            ...addRelationshipAction(id, "child", "child"),
            timestampUtcMs: at(base, 1_000),
          },
          2,
        );
        const loaded = await settled(
          receiver,
          (await receiver.load(id, "main", [relationship])).id,
        );
        expect(loaded.error?.message ?? loaded.status).toBe(
          JobStatus.READ_READY,
        );

        await expectRefused(receiver, id, [
          asOperation(
            id,
            { ...undo(1, "document"), timestampUtcMs: at(base, 2_000) },
            3,
          ),
        ]);
        expect(await rows(receiver, id, "document")).toEqual([
          "0:CREATE_DOCUMENT",
          "1:UPGRADE_DOCUMENT",
          "2:ADD_RELATIONSHIP",
        ]);
      });

      it("refuses a document-scope UNDO loaded with the CREATE", async () => {
        const { receiver, id, create, base } = await receiverWith(baseReducer);
        await expectRefused(receiver, id, [
          create,
          asOperation(
            id,
            {
              ...addRelationshipAction(id, "child", "child"),
              timestampUtcMs: at(base, 1_000),
            },
            2,
          ),
          asOperation(
            id,
            { ...undo(1, "document"), timestampUtcMs: at(base, 2_000) },
            3,
          ),
        ]);
        expect(await rows(receiver, id, "document")).toEqual([
          "0:CREATE_DOCUMENT",
          "1:UPGRADE_DOCUMENT",
        ]);
      });

      it("refuses a global-scope UNDO", async () => {
        const { receiver, id, base } = await receiverWith(baseReducer);
        const module = asOperation(
          id,
          {
            ...addModule({ id: "m0", name: "m0" }),
            timestampUtcMs: at(base, 1_000),
          },
          0,
        );
        const loaded = await settled(
          receiver,
          (await receiver.load(id, "main", [module])).id,
        );
        expect(loaded.error?.message ?? loaded.status).toBe(
          JobStatus.READ_READY,
        );

        await expectRefused(receiver, id, [
          asOperation(
            id,
            { ...undo(1, "global"), timestampUtcMs: at(base, 2_000) },
            1,
          ),
        ]);
        expect(await rows(receiver, id, "global")).toEqual(["0:ADD_MODULE"]);
      });
    });
  },
);
