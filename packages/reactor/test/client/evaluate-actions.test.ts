import type {
  AuthRequest,
  AuthSubject,
  ISigner,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReactorClient } from "../../src/client/reactor-client.js";
import type { ActionCandidate } from "../../src/client/types.js";
import { resolveFeatureFlags } from "../../src/core/feature-flags.js";
import type { IReactor } from "../../src/core/types.js";
import type { RegisteredDecisionModel } from "../../src/decision/registered-model.js";
import type { Evaluation } from "../../src/decision/types.js";
import type { ReactorFeatureFlags } from "../../src/executor/types.js";
import type { IJobAwaiter } from "../../src/shared/awaiter.js";
import { AuthEnforcementDisabledError } from "../../src/shared/errors.js";
import type {
  IDocumentIndexer,
  IDocumentView,
} from "../../src/storage/interfaces.js";
import type { IReactorSubscriptionManager } from "../../src/subs/types.js";
import {
  createMockDocumentIndexer,
  createMockDocumentView,
  createMockJobAwaiter,
  createMockLogger,
  createMockSigner,
  createMockSubscriptionManager,
} from "../factories.js";

const DOCUMENT_ID = "preflight-doc";

/** A document shaped enough to be read as one static `document` projection. */
function seedDocument(): PHDocument {
  return {
    header: {
      id: DOCUMENT_ID,
      documentType: "test",
      slug: "",
      name: "",
      branch: "main",
      revision: { document: 1, global: 2 },
      meta: {},
      sig: { publicKey: "mock-pub-key", nonce: "mock-nonce" },
      createdAtUtcIso: new Date().toISOString(),
    },
    state: {
      document: { version: 1, isDeleted: false },
      global: { counter: 3 },
    },
    initialState: {},
    operations: {},
  } as unknown as PHDocument;
}

/**
 * What the request looked like when the stub model decided it, so a test can
 * assert the preflight mirrors admission rather than inventing its own request.
 */
type DecidedRequest = {
  subject: AuthSubject;
  request: AuthRequest;
  scopeState: unknown;
  actionInput: unknown;
};

/**
 * A model with the shape the reactor registers -- one static projection over the
 * document scope -- whose verdict is looked up by operation name, so a test says
 * what it wants decided without writing a policy.
 */
function stubModel(
  verdicts: Record<string, Evaluation>,
  decided: DecidedRequest[],
): RegisteredDecisionModel {
  return (target) => ({
    projections: {
      document: {
        decidingActions: [],
        apply: (document) => document,
        query: {
          documentId: target.documentId,
          branch: target.branch,
          scope: "document",
        },
      },
    },

    evaluatesScope: () => true,

    decide: (_model, subject, request, ctx) => {
      decided.push({
        subject,
        request,
        scopeState: ctx.scopeState,
        actionInput: ctx.actionInput,
      });
      const verdict =
        request.operation === undefined
          ? undefined
          : verdicts[request.operation];
      return verdict ?? { decision: "deny", reason: "no verdict configured" };
    },
  });
}

function candidate(type: string, input?: unknown): ActionCandidate {
  return { scope: "global", type, input };
}

describe("evaluateActions", () => {
  let reactor: IReactor;
  let signer: ISigner;
  let subscriptionManager: IReactorSubscriptionManager;
  let jobAwaiter: IJobAwaiter;
  let documentIndexer: IDocumentIndexer;
  let documentView: IDocumentView;
  let documentReads: Mock;
  let decided: DecidedRequest[];

  beforeEach(() => {
    documentIndexer = createMockDocumentIndexer();
    documentView = createMockDocumentView();
    documentReads = vi.fn().mockResolvedValue(seedDocument());
    documentView.get = documentReads;
    reactor = { documentIndexer } as unknown as IReactor;
    signer = createMockSigner({
      user: {
        address: "0xSigner",
        networkId: "1",
        chainId: 1,
      },
    } as Partial<ISigner>);
    subscriptionManager = createMockSubscriptionManager();
    jobAwaiter = createMockJobAwaiter();
    decided = [];
  });

  function client(
    verdicts: Record<string, Evaluation> | undefined,
    flags: Partial<ReactorFeatureFlags> = {
      documentDecisions: true,
      authEnforcement: true,
    },
  ): ReactorClient {
    return new ReactorClient(
      createMockLogger(),
      reactor,
      signer,
      subscriptionManager,
      jobAwaiter,
      documentIndexer,
      documentView,
      undefined,
      verdicts === undefined
        ? undefined
        : {
            model: stubModel(verdicts, decided),
            flags: resolveFeatureFlags(flags),
          },
    );
  }

  /**
   * The hard requirement: with no decision model there is no answer, and the
   * legacy host-table permission system is never consulted for one.
   */
  describe("with no decision model", () => {
    it("refuses by name rather than answering", async () => {
      const rejection = client(undefined).evaluateActions(DOCUMENT_ID, "main", [
        candidate("SET_NAME"),
      ]);

      await expect(rejection).rejects.toThrow(AuthEnforcementDisabledError);

      const error: unknown = await rejection.then(
        (answer) => answer,
        (caught: unknown) => caught,
      );
      expect(Error.isError(error) && error.name).toBe(
        "AuthEnforcementDisabledError",
      );
      expect(AuthEnforcementDisabledError.isError(error)).toBe(true);
    });

    /**
     * The SharedWorker RPC boundary rebuilds a thrown error from name and
     * message alone, so the class identity does not cross it. This is that
     * rebuild: detection has to survive it, or a hook behind the worker reads
     * the flags-off refusal as a denial and greys the button out for good.
     */
    it("stays detectable once stripped to name and message", async () => {
      let caught: Error | undefined;
      try {
        await client(undefined).evaluateActions(DOCUMENT_ID, "main", [
          candidate("SET_NAME"),
        ]);
      } catch (error) {
        caught = error as Error;
      }

      expect(caught).toBeDefined();

      // Exactly what fromErrorInfo rebuilds on the tab side of the worker.
      const rebuilt = new Error(caught?.message);
      Object.defineProperty(rebuilt, "name", {
        value: caught?.name,
        configurable: true,
        writable: true,
      });

      expect(rebuilt instanceof AuthEnforcementDisabledError).toBe(false);
      expect(AuthEnforcementDisabledError.isError(rebuilt)).toBe(true);
    });

    it("refuses before reading anything", async () => {
      await expect(
        client(undefined).evaluateActions(DOCUMENT_ID, "main", []),
      ).rejects.toThrow(AuthEnforcementDisabledError);
      expect(documentReads).not.toHaveBeenCalled();
    });
  });

  describe("the answer", () => {
    it("returns one evaluation per candidate, in order", async () => {
      const answer = await client({
        A: { decision: "allow" },
        B: { decision: "deny", reason: "no grant permits this operation" },
        C: { decision: "allow" },
      }).evaluateActions(DOCUMENT_ID, "main", [
        candidate("A"),
        candidate("B"),
        candidate("C"),
      ]);

      expect(answer.evaluations).toEqual([
        { decision: "allow" },
        { decision: "deny", reason: "no grant permits this operation" },
        { decision: "allow" },
      ]);
    });

    it("aggregates a mixed set as neither all-allowed nor all-denied", async () => {
      const answer = await client({
        A: { decision: "allow" },
        B: { decision: "deny", reason: "denied by grant" },
      }).evaluateActions(DOCUMENT_ID, "main", [candidate("A"), candidate("B")]);

      expect(answer).toMatchObject({
        allAllowed: false,
        anyAllowed: true,
        allDenied: false,
        anyDenied: true,
      });
    });

    it("aggregates an all-allowed set", async () => {
      const answer = await client({
        A: { decision: "allow" },
        B: { decision: "allow" },
      }).evaluateActions(DOCUMENT_ID, "main", [candidate("A"), candidate("B")]);

      expect(answer).toMatchObject({
        allAllowed: true,
        anyAllowed: true,
        allDenied: false,
        anyDenied: false,
      });
    });

    it("aggregates an all-denied set", async () => {
      const answer = await client({
        A: { decision: "deny", reason: "denied by grant" },
        B: { decision: "deny", reason: "denied by grant" },
      }).evaluateActions(DOCUMENT_ID, "main", [candidate("A"), candidate("B")]);

      expect(answer).toMatchObject({
        allAllowed: false,
        anyAllowed: false,
        allDenied: true,
        anyDenied: true,
      });
    });

    /**
     * Nothing asked about is nothing allowed and nothing denied. A caller
     * branching on `allAllowed` over an empty set must not read it as
     * permission it never asked for.
     */
    it("aggregates no candidates as neither allowed nor denied", async () => {
      const answer = await client({}).evaluateActions(DOCUMENT_ID, "main", []);

      expect(answer).toEqual({
        evaluations: [],
        allAllowed: false,
        anyAllowed: false,
        allDenied: false,
        anyDenied: false,
      });
    });
  });

  describe("the request it decides", () => {
    it("asks about execute in the candidate's own scope", async () => {
      await client({ SET_NAME: { decision: "allow" } }).evaluateActions(
        DOCUMENT_ID,
        "main",
        [{ scope: "local", type: "SET_NAME" }],
      );

      expect(decided[0].request).toEqual({
        verb: "execute",
        scope: "local",
        operation: "SET_NAME",
      });
    });

    it("defaults the subject to the client's own signer", async () => {
      await client({ A: { decision: "allow" } }).evaluateActions(
        DOCUMENT_ID,
        "main",
        [candidate("A")],
      );

      expect(decided[0].subject).toEqual({
        address: "0xSigner",
        key: undefined,
      });
    });

    it("takes the named subject over the signer's", async () => {
      await client({ A: { decision: "allow" } }).evaluateActions(
        DOCUMENT_ID,
        "main",
        [candidate("A")],
        { address: "0xSomebodyElse" },
      );

      expect(decided[0].subject).toEqual({ address: "0xSomebodyElse" });
    });

    /**
     * Below authConditions a conditional grant does not apply at admission, so
     * supplying either half of the context here would make one apply to a
     * prediction and not to the write it predicts.
     */
    it("withholds the condition context with authConditions off", async () => {
      await client({ A: { decision: "allow" } }).evaluateActions(
        DOCUMENT_ID,
        "main",
        [candidate("A", { name: "supplied" })],
      );

      expect(decided[0].scopeState).toBeUndefined();
      expect(decided[0].actionInput).toBeUndefined();
    });

    it("supplies the scope state and the input with authConditions on", async () => {
      await client(
        { A: { decision: "allow" } },
        {
          documentDecisions: true,
          authEnforcement: true,
          authGroups: true,
          authConditions: true,
        },
      ).evaluateActions(DOCUMENT_ID, "main", [
        candidate("A", { name: "supplied" }),
      ]);

      expect(decided[0].scopeState).toEqual({ counter: 3 });
      expect(decided[0].actionInput).toEqual({ name: "supplied" });
    });
  });

  /**
   * The executor never decides CREATE_DOCUMENT against a policy -- the document
   * does not exist yet when it runs (GATED_DOCUMENT_ACTIONS excludes it) -- so
   * the preflight must not predict a denial the submit path never issues, even
   * against a deny-all policy.
   */
  describe("CREATE_DOCUMENT", () => {
    it("predicts allow without consulting the policy", async () => {
      const answer = await client({}).evaluateActions(DOCUMENT_ID, "main", [
        {
          scope: "document",
          type: "CREATE_DOCUMENT",
          input: { model: "test" },
        },
      ]);

      expect(answer.evaluations).toEqual([{ decision: "allow" }]);
      expect(answer.allAllowed).toBe(true);
      expect(decided).toHaveLength(0);
    });

    it("exempts only the create in a mixed batch", async () => {
      const answer = await client({
        DELETE_DOCUMENT: { decision: "deny", reason: "denied by grant" },
      }).evaluateActions(DOCUMENT_ID, "main", [
        { scope: "document", type: "CREATE_DOCUMENT" },
        {
          scope: "document",
          type: "DELETE_DOCUMENT",
          input: { documentId: DOCUMENT_ID },
        },
      ]);

      expect(answer.evaluations).toEqual([
        { decision: "allow" },
        { decision: "deny", reason: "denied by grant" },
      ]);
      expect(decided).toHaveLength(1);
    });
  });

  /**
   * A batch of candidates against one document is one model build. The
   * projections are the same for every candidate in it, so reading them per
   * candidate would multiply the cost of a toolbar by its button count.
   */
  it("builds the model once for a batch against one document", async () => {
    await client({
      A: { decision: "allow" },
      B: { decision: "allow" },
      C: { decision: "allow" },
    }).evaluateActions(DOCUMENT_ID, "main", [
      candidate("A"),
      candidate("B"),
      candidate("C"),
    ]);

    expect(documentReads).toHaveBeenCalledTimes(1);
    expect(decided).toHaveLength(3);
  });
});
