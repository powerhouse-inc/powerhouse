import type {
  Action,
  Grant,
  Operation,
  PHDocument,
  ProtocolVersions,
  StateReducer,
} from "@powerhousedao/shared/document-model";
import {
  AUTH_NO_GRANT_REASON,
  defaultAuthState,
  initializeAuth,
  removeGrant,
  retract,
  setGrant,
} from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import {
  authConditionsDecisionModel,
  authDecisionModel,
} from "../../src/decision/auth-decision-model.js";
import { evaluateByPosition } from "../../src/decision/evaluation.js";
import type {
  DecisionModel,
  DecisionStores,
  DecisionTarget,
} from "../../src/decision/types.js";
import { DocumentModelRegistry } from "../../src/registry/implementation.js";
import { ModuleNotFoundError } from "../../src/registry/errors.js";
import { BASE_REDUCER_3_VERSIONS } from "../factories.js";

const DOCUMENT_ID = "retraction-doc";
const TARGET: DecisionTarget = { documentId: DOCUMENT_ID, branch: "main" };
const LOCKED = "locked by the global scope";

type Applied = { applied: string[] };

function at(action: Action, index: number, extra: Partial<Operation> = {}) {
  const timestampUtcMs = new Date(
    Date.UTC(2026, 0, 1, 0, 0, index),
  ).toISOString();
  return {
    id: `op-${action.id}`,
    index,
    skip: 0,
    hash: "",
    timestampUtcMs,
    action: { ...action, timestampUtcMs },
    ...extra,
  } as Operation;
}

function set(id: string): Action {
  return {
    id,
    type: "SET",
    scope: "global",
    timestampUtcMs: "",
    input: {},
  } as Action;
}

function signed(action: Action, address: string): Action {
  return {
    ...action,
    context: {
      signer: {
        user: { address, networkId: "", chainId: 0 },
        app: { name: "test", key: `key-${address}` },
        signatures: [],
      },
    },
  } as Action;
}

function stores(
  versions: ProtocolVersions,
  streams: Record<string, Operation[]>,
): DecisionStores {
  const state = {
    document: { isDeleted: false },
    auth: defaultAuthState(),
    global: { applied: [] },
  };
  return {
    operationStore: {
      getSince: (_documentId: string, scope: string) =>
        Promise.resolve({ results: streams[scope] ?? [], options: {} }),
    },
    writeCache: {
      getState: () =>
        Promise.resolve({
          header: {
            id: DOCUMENT_ID,
            documentType: "t",
            protocolVersions: versions,
            sig: { publicKey: {}, nonce: "" },
          },
          state,
          initialState: state,
          operations: {},
          clipboard: [],
        } as unknown as PHDocument),
    },
  } as unknown as DecisionStores;
}

/** Refuses a SET while the global scope holds the "lock" row. */
function lockModel(
  target: DecisionTarget,
): DecisionModel<{ document: unknown }> {
  const reducer: StateReducer = (state, action) => {
    (state as unknown as { global: Applied }).global.applied.push(action.id);
    return undefined;
  };
  return {
    projections: {
      document: {
        decidingActions: ["SET"],
        apply: (document: PHDocument) => document,
        query: { ...target, scope: "document" },
      },
    },
    // Base-reducer 1 and 2 apply row by row, with RETRACT inert.
    foldEvaluatedScope: (document, operation) =>
      operation.action.type === "RETRACT"
        ? document
        : ({
            ...document,
            state: {
              ...document.state,
              global: {
                applied: [
                  ...(document.state as unknown as { global: Applied }).global
                    .applied,
                  operation.action.id,
                ],
              },
            },
          } as PHDocument),
    evaluatedScopeReducer: () => () => reducer,
    evaluatesScope: () => true,
    decide(_model, _subject, request, ctx) {
      const locked = (ctx.scopeState as Applied).applied.includes("lock");
      return locked && request.operation === "SET"
        ? { decision: "deny", reason: LOCKED }
        : { decision: "allow" };
    },
  };
}

describe("evaluateByPosition with RETRACT", () => {
  it("decides after a RETRACT against the state it re-derived", async () => {
    const reasons = await evaluateByPosition(
      lockModel,
      TARGET,
      {
        scope: "global",
        operations: [at(retract("lock", "global"), 1), at(set("w"), 2)],
      },
      stores(BASE_REDUCER_3_VERSIONS, { global: [at(set("lock"), 0)] }),
    );

    expect(reasons).toEqual([undefined, undefined]);
  });

  it("gives a stored-denied RETRACT no effect", async () => {
    const reasons = await evaluateByPosition(
      lockModel,
      TARGET,
      { scope: "global", operations: [at(set("w"), 2)] },
      stores(BASE_REDUCER_3_VERSIONS, {
        global: [
          at(set("lock"), 0),
          at(retract("lock", "global"), 1, { deniedReason: LOCKED }),
        ],
      }),
    );

    expect(reasons).toEqual([LOCKED]);
  });

  it("leaves base-reducer 2 decisions as they were, with RETRACT inert", async () => {
    const reasons = await evaluateByPosition(
      lockModel,
      TARGET,
      {
        scope: "global",
        operations: [at(retract("lock", "global"), 1), at(set("w"), 2)],
      },
      stores({ "base-reducer": 2 } as ProtocolVersions, {
        global: [at(set("lock"), 0)],
      }),
    );

    expect(reasons).toEqual([undefined, LOCKED]);
  });

  it("leaves a RETRACT in the auth scope inert", async () => {
    const ADMIN = "0xAdmin";
    const WRITER = "0xWriter";
    const grant = (id: string, address: string): Grant => ({
      id,
      description: id,
      effect: "allow",
      principal: { address },
      capability: { can: "execute", scope: "*" },
    });
    const writerGrant = setGrant({ grant: grant("g-writer", WRITER) });
    const stored = stores(BASE_REDUCER_3_VERSIONS, {
      auth: [
        at(
          initializeAuth({ version: 1, grants: [grant("g-admin", ADMIN)] }),
          0,
        ),
        at(signed(writerGrant, ADMIN), 1),
      ],
    });
    const evaluateAfter = (first: Action) =>
      evaluateByPosition(
        authDecisionModel,
        TARGET,
        {
          scope: "auth",
          operations: [
            at(signed(first, ADMIN), 2),
            at(
              signed(setGrant({ grant: grant("g-extra", WRITER) }), WRITER),
              3,
            ),
          ],
        },
        stored,
      );

    expect(await evaluateAfter(retract(writerGrant.id, "auth"))).toEqual([
      undefined,
      undefined,
    ]);
    // The writer's grant decides: removing it refuses the write.
    expect(await evaluateAfter(removeGrant({ id: "g-writer" }))).toEqual([
      undefined,
      AUTH_NO_GRANT_REASON,
    ]);
  });
});

describe("evaluateByPosition without the evaluated document's state reducer", () => {
  const anyone: Grant = {
    id: "g-anyone",
    description: "anyone",
    effect: "allow",
    principal: { anyone: true },
    capability: { can: "execute", scope: "*" },
  };
  const evaluate = (
    versions: ProtocolVersions,
    registry: DocumentModelRegistry,
  ) =>
    evaluateByPosition(
      authConditionsDecisionModel(registry),
      TARGET,
      { scope: "global", operations: [at(set("w"), 1)] },
      stores(versions, {
        auth: [at(initializeAuth({ version: 1, grants: [anyone] }), 0)],
      }),
    );

  it("throws on base-reducer 3 when the model is not registered", async () => {
    await expect(
      evaluate(BASE_REDUCER_3_VERSIONS, new DocumentModelRegistry()),
    ).rejects.toThrow(ModuleNotFoundError);
  });

  it("applies nothing on base-reducer 2, as before", async () => {
    expect(
      await evaluate(
        { "base-reducer": 2 } as ProtocolVersions,
        new DocumentModelRegistry(),
      ),
    ).toEqual([undefined]);
  });
});
