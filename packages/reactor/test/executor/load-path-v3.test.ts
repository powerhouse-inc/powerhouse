import type {
  Action,
  DocumentModelDocument,
  Operation,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import {
  addModule,
  deriveOperationId,
  generateId,
} from "@powerhousedao/shared/document-model";
import { afterEach, describe, expect, it } from "vitest";
import type { InProcessReactorModule } from "../../src/core/types.js";
import { JobStatus, type JobInfo } from "../../src/shared/types.js";
import {
  createBaseReducer3Document,
  createUndoV3ReactorBuilder,
} from "../factories.js";
import { assertOneRuleAgreement, storedRows } from "./one-rule-agreement.js";

function shape(stream: Operation[]): string {
  return stream
    .map((operation) => {
      const label =
        operation.action.type === "NOOP"
          ? "NOOP"
          : (operation.action.input as { id: string }).id;
      return `${operation.index}:${label}/${operation.skip}`;
    })
    .join(" ");
}

describe("base-reducer 3", () => {
  describe("the load path", () => {
    let module: InProcessReactorModule | undefined;
    let document: PHDocument;
    let docId: string;
    let base: number;

    afterEach(() => {
      module?.reactor.kill();
      module = undefined;
    });

    async function build(): Promise<void> {
      module = await createUndoV3ReactorBuilder()
        .withWriteCacheConfig({ keyframeInterval: 2 })
        .buildModule();
      document = createBaseReducer3Document({ signaturePolicy: "legacy" });
      docId = document.header.id;
      const created = await settle(await module.reactor.create(document));
      expect(created.error?.message ?? created.status).toBe(
        JobStatus.READ_READY,
      );
      expect(
        (await module.reactor.get(docId)).header.protocolVersions?.[
          "base-reducer"
        ],
      ).toBe(3);
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

    function at(action: Action, offsetMs: number): Action {
      return {
        ...action,
        timestampUtcMs: new Date(base + offsetMs).toISOString(),
      };
    }

    function noop(offsetMs: number): Action {
      return at(
        {
          id: generateId(),
          type: "NOOP",
          input: {},
          scope: "global",
          timestampUtcMs: "",
        },
        offsetMs,
      );
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

    async function execute(actions: Action[]): Promise<void> {
      const job = await settle(
        await module!.reactor.execute(docId, "main", actions),
      );
      expect(job.error?.message ?? job.status).toBe(JobStatus.READ_READY);
    }

    async function load(operations: Operation[]): Promise<void> {
      const job = await settle(
        await module!.reactor.load(docId, "main", operations),
      );
      expect(job.error?.message ?? job.status).toBe(JobStatus.READ_READY);
    }

    async function modules(): Promise<string[]> {
      const served = await module!.reactor.get<DocumentModelDocument>(docId);
      return served.state.global.specifications[0].modules.map(
        (entry) => entry.id,
      );
    }

    // Base-reducer 2 would restore the NOOP's skip to 1 and retract x.
    it("keeps a re-appended NOOP's skip at zero in a reshuffle", async () => {
      await build();
      await execute([at(addModule({ id: "w", name: "w" }), 20)]);

      const x = at(addModule({ id: "x", name: "x" }), 0);
      await load([asOperation(x, 0), asOperation(noop(10), 1, 1)]);

      expect(shape(await storedRows(module!, docId))).toBe(
        "0:w/0 1:x/1 2:NOOP/0 3:w/0",
      );
      expect(await modules()).toEqual(["x", "w"]);
      await assertOneRuleAgreement({ module: module!, document });
    });

    it("writes a trivially appended NOOP with skip zero", async () => {
      await build();
      await execute([at(addModule({ id: "x", name: "x" }), 0)]);

      const y = at(addModule({ id: "y", name: "y" }), 10);
      await load([asOperation(y, 1), asOperation(noop(20), 2, 1)]);

      expect(shape(await storedRows(module!, docId))).toBe(
        "0:x/0 1:y/0 2:NOOP/0",
      );
      expect(await modules()).toEqual(["x", "y"]);
      await assertOneRuleAgreement({ module: module!, document });
    });

    // The sender holds 0:w 1:y 2/1:x 3:y; its skip is not read here.
    it("appends a sender's reshuffled rows in timestamp order", async () => {
      await build();
      await execute([at(addModule({ id: "w", name: "w" }), 0)]);

      const x = at(addModule({ id: "x", name: "x" }), 10);
      const y = at(addModule({ id: "y", name: "y" }), 20);
      await load([asOperation(y, 1), asOperation(x, 2, 1), asOperation(y, 3)]);

      expect(shape(await storedRows(module!, docId))).toBe("0:w/0 1:x/0 2:y/0");
      expect(await modules()).toEqual(["w", "x", "y"]);
      await assertOneRuleAgreement({ module: module!, document });
    });
  });
});
