import type {
  ISigner,
  SignaturePolicy,
} from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import type { IReactor } from "../../core/types.js";
import type { IReadGate } from "../../decision/read-gate.js";
import type { IJobAwaiter } from "../../shared/awaiter.js";
import type {
  IDocumentIndexer,
  IDocumentView,
} from "../../storage/interfaces.js";
import type { IReactorSubscriptionManager } from "../../subs/types.js";
import type { DriveClientOptions } from "../drive-nodes.js";
import type { ProtocolSelection } from "../types.js";
import type { ActionEvaluationConfig } from "./evaluation.js";
import type { WriteSideParts } from "./targets.js";

/**
 * Everything the in-process read and write clients are built from. Both halves
 * take the same parts so a host composes them once; each half uses only what
 * its side needs.
 */
export type ReactorClientParts = {
  logger: ILogger;
  reactor: IReactor;
  signer: ISigner;
  subscriptionManager: IReactorSubscriptionManager;
  jobAwaiter: IJobAwaiter;
  documentIndexer: IDocumentIndexer;
  documentView: IDocumentView;
  readGate: IReadGate;
  actionEvaluation: ActionEvaluationConfig | undefined;
  createSignaturePolicy: SignaturePolicy;
  protocolSelection: ProtocolSelection;
  /**
   * The write side's identity table and operation store. Without them (a
   * client built from `withReactor`), write targets resolve on the document
   * view.
   */
  writeSide: WriteSideParts | undefined;
  /**
   * The drive node source `read.drives` answers from and the write strategies
   * `write.drives` delegates to by drive type. Empty: every drive takes the
   * document-drive path.
   */
  drives: DriveClientOptions;
};
