import type {
  Operation,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import type {
  AuthRequest,
  AuthSubject,
} from "@powerhousedao/shared/document-model";
import type { IWriteCache } from "../cache/write/interfaces.js";
import type {
  AppendCondition,
  IOperationStore,
} from "../storage/interfaces.js";

/** One operation stream. */
export type StreamQuery = {
  documentId: string;
  branch: string;
  scope: string;
};

/** The document and branch a decision model is built for. */
export type DecisionTarget = {
  documentId: string;
  branch: string;
};

/**
 * The operations an evaluation is about, all in one scope of one document. This
 * is what gets evaluated, as against the criteria that decide whether a
 * re-evaluation is owed at all.
 */
export type EvaluationSubject = {
  scope: string;
  operations: Operation[];
};

/** What an evaluation reads the streams it needs through. */
export type DecisionStores = {
  writeCache: IWriteCache;
  operationStore: IOperationStore;
};

/** The executing scope's own state, for conditions that read it. */
export type DecisionContext = {
  scopeState: unknown;
};

/**
 * A named stream whose value in the model is that scope's state from the
 * document rebuild the reactor already performs. A derived query may read
 * only statically-queried projections, so composition is one layer deep.
 */
export type Projection<M> = {
  query: StreamQuery | ((model: Partial<M>) => StreamQuery[]);

  /**
   * Action types in this stream that can change an evaluation. Reads of the stream
   * are filtered to these, so anything left out is invisible to a decision.
   */
  decidingActions: string[];

  /** Applies one of this stream's operations while deciding. */
  apply: (document: PHDocument, operation: Operation) => PHDocument;
};

/**
 * The outcome of evaluating one operation. A refusal carries the reason it is
 * recorded with, because a model has more than one way to refuse.
 */
export type Evaluation =
  | { decision: "allow" }
  | { decision: "deny"; reason: string };

/** A stream a model reads, with what it needs to be walked. */
export type ReadStream = {
  /** The projection this stream belongs to, which is its name in the model. */
  name: string;

  query: StreamQuery;
  decidingActions: string[];
  apply: (document: PHDocument, operation: Operation) => PHDocument;
};

/** Projections plus a decision function over the built model. */
export type DecisionModel<M> = {
  projections: { [K in keyof M]: Projection<M> };

  /**
   * Whether or not this model decides about operations in a given scope. That
   * is, a scope it reads is not necessarily one it evaluates, and vise-versa.
   */
  evaluatesScope(scope: string): boolean;

  decide(
    model: M,
    subject: AuthSubject,
    request: AuthRequest,
    ctx: DecisionContext,
  ): Evaluation;
};

/** A built model plus the read-set condition recording what the build read. */
export type BuiltDecisionModel<M> = {
  model: M;
  appendCondition: AppendCondition;
};
