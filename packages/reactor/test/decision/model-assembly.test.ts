import type {
  AuthRequest,
  AuthSubject,
  Operation,
  PHAuthState,
  PHDocument,
  PHDocumentState,
} from "@powerhousedao/shared/document-model";
import {
  AUTH_DENIED_BY_GRANT_REASON,
  AUTH_NO_GRANT_REASON,
  DOCUMENT_DELETED_REASON,
} from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import { authDecisionModel } from "../../src/decision/auth-decision-model.js";
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

  /**
   * Reading from index 0 exclusive would hide an index-0 operation from the walk
   * while `getState(..., 0)` had already applied it, so an operation sorting
   * before it would wrongly see its effect. On the auth stream that index is the
   * genesis policy, so this is the normal case.
   */
  it("visits a deciding operation at index 0 instead of pre-applying it", async () => {
    seen.length = 0;
    const documentId = "index-zero-doc";

    const op = (id: string, scope: string, seconds: number, index: number) =>
      ({
        id: `op-${id}`,
        index,
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

    const lock = op("lock", "permissions", 10, 0);

    // Honours the bound the way the store does (index > revision).
    const operationStore = {
      getSince: (
        _documentId: string,
        scope: string,
        _branch: string,
        revision: number,
      ): Promise<{ results: Operation[] }> =>
        Promise.resolve({
          results:
            scope === "permissions" && lock.index > revision ? [lock] : [],
        }),
    } as never;

    // Honours targetRevision the way the cache does.
    const writeCache = {
      getState: (
        _documentId: string,
        scope: string,
        _branch: string,
        targetRevision?: number,
      ): Promise<PHDocument> =>
        Promise.resolve({
          header: { id: documentId, documentType: "t" },
          state: {
            document: {},
            permissions:
              scope === "permissions" &&
              targetRevision !== undefined &&
              targetRevision >= 0
                ? { locked: true }
                : {},
            global: {},
          },
          operations: {},
          clipboard: [],
          initialState: {},
        } as never as PHDocument),
    } as never;

    // The write sorts before the lock, so the lock must not apply to it.
    const evaluations = await evaluateByPosition(
      twoProjectionModel,
      { documentId, branch: "main" },
      { scope: "global", operations: [op("write", "global", 5, 0)] },
      { writeCache, operationStore },
    );

    expect(evaluations).toEqual([undefined]);
    expect(seen).toEqual([{ document: {}, permissions: {} }]);
  });

  it("names the document model's one projection", () => {
    const readSet = staticReadSet(
      documentDecisionModel({ documentId: "d", branch: "main" }),
    );
    expect(readSet.map((stream) => stream.name)).toEqual(["document"]);
  });

  it("names the auth model's two projections", () => {
    const readSet = staticReadSet(
      authDecisionModel({ documentId: "d", branch: "main" }),
    );

    expect(
      readSet.map((stream) => [
        stream.name,
        stream.query.scope,
        stream.decidingActions,
      ]),
    ).toEqual([
      ["document", "document", ["DELETE_DOCUMENT"]],
      [
        "auth",
        "auth",
        ["INITIALIZE_AUTH", "SET_GRANT", "REMOVE_GRANT", "MOVE_GRANT"],
      ],
    ]);
  });
});

/**
 * The step order makes a deleted document refuse everything, and lets the read
 * gate be the same algorithm as the write gate plus one named carve-out.
 */
describe("the auth model's decision steps", () => {
  const definition = authDecisionModel({ documentId: "d", branch: "main" });

  const allowAll: PHAuthState = {
    version: 1,
    grants: [
      {
        id: "g-open",
        description: "open",
        effect: "allow",
        principal: { anyone: true },
        capability: { can: "execute", scope: "*" },
      },
      {
        id: "g-open-read",
        description: "open read",
        effect: "allow",
        principal: { anyone: true },
        capability: { can: "read", scope: "*" },
      },
    ],
  };

  function model(isDeleted: boolean, auth: PHAuthState) {
    return {
      document: { isDeleted } as never as PHDocumentState,
      auth,
    };
  }

  it("refuses a write on a deleted document even under an allow-all policy", () => {
    const evaluation = definition.decide(
      model(true, allowAll),
      { address: "0xabc" },
      { verb: "execute", scope: "global", operation: "SET_NAME" },
      { scopeState: undefined },
    );

    expect(evaluation).toEqual({
      decision: "deny",
      reason: DOCUMENT_DELETED_REASON,
    });
  });

  // A read has no position, so a positional refusal has nothing to say about it.
  it("does not refuse a read on a deleted document", () => {
    const evaluation = definition.decide(
      model(true, allowAll),
      { address: "0xabc" },
      { verb: "read", scope: "global" },
      { scopeState: undefined },
    );

    expect(evaluation).toEqual({ decision: "allow" });
  });

  it("reports which policy rule refused", () => {
    const noGrants: PHAuthState = { version: 1, grants: [] };
    expect(
      definition.decide(
        model(false, noGrants),
        { address: "0xabc" },
        { verb: "execute", scope: "global", operation: "SET_NAME" },
        { scopeState: undefined },
      ),
    ).toEqual({ decision: "deny", reason: AUTH_NO_GRANT_REASON });

    const explicitDeny: PHAuthState = {
      version: 1,
      grants: [
        ...allowAll.grants,
        {
          id: "g-freeze",
          description: "freeze",
          effect: "deny",
          principal: { anyone: true },
          capability: { can: "execute", scope: "*" },
        },
      ],
    };
    expect(
      definition.decide(
        model(false, explicitDeny),
        { address: "0xabc" },
        { verb: "execute", scope: "global", operation: "SET_NAME" },
        { scopeState: undefined },
      ),
    ).toEqual({ decision: "deny", reason: AUTH_DENIED_BY_GRANT_REASON });
  });

  it("leaves an uninitialized policy open", () => {
    expect(
      definition.decide(
        model(false, { version: 0, grants: [] }),
        {},
        { verb: "execute", scope: "global", operation: "SET_NAME" },
        { scopeState: undefined },
      ),
    ).toEqual({ decision: "allow" });
  });

  it("evaluates the auth scope too, so a delete refuses an auth write after it", () => {
    expect(definition.evaluatesScope("auth")).toBe(true);

    expect(
      definition.decide(
        model(true, allowAll),
        { address: "0xabc" },
        { verb: "execute", scope: "auth", operation: "SET_GRANT" },
        { scopeState: undefined },
      ),
    ).toEqual({ decision: "deny", reason: DOCUMENT_DELETED_REASON });
  });
});

/**
 * The carve-out matches on `subject.key` and an `{address}` grant on
 * `subject.address`, so an anonymous replay would let a policy deny its own
 * author's history.
 */
describe("the subject and request a replayed operation is evaluated as", () => {
  type OneScope = { document: Record<string, never> };

  const calls: Array<{ subject: AuthSubject; request: AuthRequest }> = [];

  function recordingModel(target: DecisionTarget): DecisionModel<OneScope> {
    return {
      projections: {
        document: {
          decidingActions: ["SET"],
          apply: (document) => document,
          query: { ...target, scope: "document" },
        },
      },
      evaluatesScope: () => true,
      decide(_model, subject, request): Evaluation {
        calls.push({ subject, request });
        return { decision: "allow" };
      },
    };
  }

  function signedOp(
    id: string,
    seconds: number,
    scope: string,
    index: number,
    signer?: { address: string; key: string },
  ) {
    return {
      id: `op-${id}`,
      index,
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
        ...(signer
          ? {
              context: {
                signer: {
                  user: { address: signer.address },
                  app: { key: signer.key },
                },
              },
            }
          : {}),
      },
    } as never as Operation;
  }

  const operationStore = {
    getSince: (): Promise<{ results: Operation[] }> =>
      Promise.resolve({ results: [] }),
  } as never;

  const writeCache = {
    getState: (): Promise<PHDocument> =>
      Promise.resolve({
        header: { id: "subject-doc", documentType: "t" },
        state: { document: {}, global: {} },
        operations: {},
        clipboard: [],
        initialState: {},
      } as never as PHDocument),
  } as never;

  it("evaluates each operation as its own signer", async () => {
    calls.length = 0;

    await evaluateByPosition(
      recordingModel,
      { documentId: "subject-doc", branch: "main" },
      {
        scope: "global",
        operations: [
          signedOp("first", 1, "global", 0, {
            address: "0xalice",
            key: "did:key:alice",
          }),
          signedOp("second", 2, "global", 1, {
            address: "0xbob",
            key: "did:key:bob",
          }),
          signedOp("third", 3, "global", 2),
        ],
      },
      { writeCache, operationStore },
    );

    expect(calls.map((call) => call.subject)).toEqual([
      { address: "0xalice", key: "did:key:alice" },
      { address: "0xbob", key: "did:key:bob" },
      { address: undefined, key: undefined },
    ]);
  });

  // The scope has to come from the operation rather than the batch, so that a
  // model evaluating more than one written scope asks the right question.
  it("takes the request scope from the operation, not the batch", async () => {
    calls.length = 0;

    await evaluateByPosition(
      recordingModel,
      { documentId: "subject-doc", branch: "main" },
      {
        scope: "global",
        operations: [signedOp("only", 1, "auth", 0)],
      },
      { writeCache, operationStore },
    );

    expect(calls.map((call) => call.request)).toEqual([
      { verb: "execute", scope: "auth", operation: "SET" },
    ]);
  });
});
