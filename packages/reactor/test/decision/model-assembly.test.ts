import type {
  Operation,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import { staticReadSet } from "../../src/decision/build-decision-model.js";
import { evaluateByPosition } from "../../src/decision/evaluation.js";
import { documentDecisionModel } from "../../src/decision/document-decision-model.js";
import type {
  DecisionModel,
  DecisionTarget,
  Evaluation,
} from "../../src/decision/types.js";

/**
 * A model reads more than one scope from stage 4 onward, so each projection's
 * value has to come from the stream that projection reads, named by the
 * projection rather than picked out of the states by shape.
 */
describe("model assembly", () => {
  type TwoScopes = {
    document: { isDeleted?: boolean };
    permissions: { locked?: boolean };
  };

  const seen: Array<TwoScopes> = [];

  function twoProjectionModel(
    target: DecisionTarget,
  ): DecisionModel<TwoScopes> {
    const applyFlag =
      (scope: string, flag: string) =>
      (document: PHDocument, operation: Operation): PHDocument =>
        operation.action.type === "SET"
          ? ({
              ...document,
              state: {
                ...document.state,
                [scope]: { [flag]: true },
              },
            } as PHDocument)
          : document;

    return {
      projections: {
        document: {
          decidingActions: ["SET"],
          apply: applyFlag("document", "isDeleted"),
          query: { ...target, scope: "document" },
        },
        permissions: {
          decidingActions: ["SET"],
          apply: applyFlag("permissions", "locked"),
          query: { ...target, scope: "permissions" },
        },
      },
      evaluatesScope: () => true,
      decide(model): Evaluation {
        seen.push(model);
        return model.permissions.locked
          ? { decision: "deny", reason: "locked by permissions" }
          : { decision: "allow" };
      },
    };
  }

  it("names every statically-queried stream after its projection", () => {
    const readSet = staticReadSet(
      twoProjectionModel({ documentId: "d", branch: "main" }),
    );

    expect(readSet.map((stream) => [stream.name, stream.query.scope])).toEqual([
      ["document", "document"],
      ["permissions", "permissions"],
    ]);
  });

  it("gives each projection the state of the stream it reads", async () => {
    seen.length = 0;
    const documentId = "two-scope-doc";

    const op = (id: string, scope: string, seconds: number) =>
      ({
        id: `op-${id}`,
        index: 0,
        skip: 0,
        hash: "h",
        timestampUtcMs: new Date(
          Date.UTC(2026, 0, 1, 0, 0, seconds),
        ).toISOString(),
        action: {
          id,
          type: "SET",
          scope,
          timestampUtcMs: new Date(
            Date.UTC(2026, 0, 1, 0, 0, seconds),
          ).toISOString(),
          input: {},
        },
      }) as never as Operation;

    // The permissions stream already holds a locking operation; the document
    // stream holds none.
    const operationStore = {
      getSince: (
        _documentId: string,
        scope: string,
      ): Promise<{ results: Operation[] }> =>
        Promise.resolve({
          results:
            scope === "permissions" ? [op("lock", "permissions", 1)] : [],
        }),
    } as never;

    const writeCache = {
      getState: (): Promise<PHDocument> =>
        Promise.resolve({
          header: { id: documentId, documentType: "t" },
          state: { document: {}, permissions: {}, global: {} },
          operations: {},
          clipboard: [],
          initialState: {},
        } as never as PHDocument),
    } as never;

    const evaluations = await evaluateByPosition(
      twoProjectionModel,
      { documentId, branch: "main" },
      { scope: "global", operations: [op("write", "global", 5)] },
      { writeCache, operationStore },
    );

    // The permissions projection carries its own stream's state, so the refusal
    // comes from there rather than from the document projection.
    expect(evaluations).toEqual(["locked by permissions"]);
    expect(seen).toEqual([{ document: {}, permissions: { locked: true } }]);
  });

  it("names the document model's one projection", () => {
    const readSet = staticReadSet(
      documentDecisionModel({ documentId: "d", branch: "main" }),
    );
    expect(readSet.map((stream) => stream.name)).toEqual(["document"]);
  });
});
