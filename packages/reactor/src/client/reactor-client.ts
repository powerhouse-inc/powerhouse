import type {
  Action,
  AuthSubject,
  CreateDocumentActionInput,
  DocumentModelModule,
  ISigner,
  Operation,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import {
  actions,
  DowngradeNotSupportedError,
  normalizeDocumentModelVersion,
  UnsupportedDocumentModelVersionError,
} from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import {
  addRelationshipAction,
  createDocumentAction,
  upgradeDocumentAction,
} from "../actions/index.js";
import type {
  BatchExecutionRequest,
  BatchExecutionResult,
  BatchLoadRequest,
  BatchLoadResult,
  ExecutionJobPlan,
  IReactor,
} from "../core/types.js";
import { getSharedActionScope, signActions } from "../core/utils.js";
import { type IJobAwaiter } from "../shared/awaiter.js";
import { AuthEnforcementDisabledError } from "../shared/errors.js";
import {
  JobStatus,
  PropagationMode,
  RelationshipChangeType,
  type JobInfo,
  type PagedResults,
  type PagingOptions,
  type SearchFilter,
  type ViewFilter,
} from "../shared/types.js";
import type {
  IDocumentIndexer,
  IDocumentView,
  OperationFilter,
} from "../storage/interfaces.js";
import type { IReactorSubscriptionManager } from "../subs/types.js";
import {
  decodeCompositeCursor,
  encodeCompositeCursor,
  isCompositeCursor,
} from "./cursor.js";
import { DriveClient } from "./drive-client.js";
import {
  DEFAULT_UPGRADE_CONFLICT_RETRIES,
  DocumentChangeType,
  type ActionCandidate,
  type ActionEvaluations,
  type CreateDocumentOptions,
  type DocumentChangeEvent,
  type IDriveClient,
  type IReactorClient,
  type UpgradeDocumentOptions,
} from "./types.js";
import { buildDecisionModel } from "../decision/build-decision-model.js";
import type { IReadGate } from "../decision/read-gate.js";
import { BareReadGate, SeededStateReader } from "../decision/read-gate.js";
import type { DocumentDecisionModel } from "../decision/document-decision-model.js";
import type { RegisteredDecisionModel } from "../decision/registered-model.js";
import type { DecisionModel, Evaluation } from "../decision/types.js";
import { GATED_DOCUMENT_ACTIONS, targetDocumentId } from "../executor/util.js";
import type { ReactorFeatureFlags } from "../executor/types.js";
import {
  authSubjectFromSigner,
  filterReadableScopes,
  withAuthScope,
} from "./util.js";

/**
 * A decision model built for one target document, with what deciding a candidate
 * against it needs: the definition that decides, the built model it decides
 * over, and the scope states a condition reads.
 */
type EvaluationTarget = {
  definition: DecisionModel<DocumentDecisionModel>;
  model: DocumentDecisionModel;
  scopeStates: Record<string, unknown>;
};

/**
 * The document a candidate is decided against. Routed on the action type alone,
 * which is what the executor routes on: every action the reactor reduces onto
 * the document scope carries that scope already, and the gate follows the
 * action's own target rather than the document the request named.
 */
function evaluationTargetId(
  candidate: ActionCandidate,
  fallback: string,
): string {
  return GATED_DOCUMENT_ACTIONS.has(candidate.type)
    ? targetDocumentId(
        { type: candidate.type, input: candidate.input },
        fallback,
      )
    : fallback;
}

/**
 * One candidate's verdict, decided exactly as admission decides it: the same
 * request, and a condition context populated only while authConditions is on,
 * so a conditional grant applies here precisely when it would apply there.
 * Groups need nothing added, because the selected model carries them.
 */
function decideCandidate(
  config: ActionEvaluationConfig,
  target: EvaluationTarget,
  subject: AuthSubject,
  candidate: ActionCandidate,
): Evaluation {
  return target.definition.decide(
    target.model,
    subject,
    { verb: "execute", scope: candidate.scope, operation: candidate.type },
    config.flags.authConditions
      ? {
          scopeState: target.scopeStates[candidate.scope],
          actionInput: candidate.input,
        }
      : { scopeState: undefined, actionInput: undefined },
  );
}

/**
 * What {@link IReactorClient.evaluateActions} decides against: the decision
 * model this reactor enforces, and the flags that selected it.
 *
 * Both, because neither alone is enough. The flags say which of the model's
 * inputs a decision may read, and the model itself cannot be derived from them
 * here: selecting one needs the document model registry, which a client does not
 * hold. Absent, this client answers no preflight at all -- which is the whole of
 * the non-coexistence guarantee, since a client built without a reactor holding
 * a decision model has nothing to answer from.
 */
export type ActionEvaluationConfig = {
  model: RegisteredDecisionModel;
  flags: ReactorFeatureFlags;
};

/**
 * ReactorClient implementation that wraps lower-level APIs to provide
 * a simpler interface for document operations.
 *
 * Features:
 * - Wraps Jobs with Promises for easier async handling
 * - Manages signing of submitted Action objects
 * - Provides quality-of-life functions for common tasks
 * - Wraps subscription interface with ViewFilters
 */
export class ReactorClient implements IReactorClient {
  private logger: ILogger;
  private reactor: IReactor;
  private signer: ISigner;
  private subscriptionManager: IReactorSubscriptionManager;
  private jobAwaiter: IJobAwaiter;
  private documentIndexer: IDocumentIndexer;
  private documentView: IDocumentView;
  private readGate: IReadGate;
  private actionEvaluation: ActionEvaluationConfig | undefined;

  readonly drives: IDriveClient;

  constructor(
    logger: ILogger,
    reactor: IReactor,
    signer: ISigner,
    subscriptionManager: IReactorSubscriptionManager,
    jobAwaiter: IJobAwaiter,
    documentIndexer: IDocumentIndexer,
    documentView: IDocumentView,
    readGate: IReadGate = new BareReadGate(),
    actionEvaluation?: ActionEvaluationConfig,
  ) {
    this.logger = logger;
    this.reactor = reactor;
    this.signer = signer;
    this.subscriptionManager = subscriptionManager;
    this.jobAwaiter = jobAwaiter;
    this.documentIndexer = documentIndexer;
    this.documentView = documentView;
    this.readGate = readGate;
    this.actionEvaluation = actionEvaluation;
    this.drives = new DriveClient(this, logger, reactor, signer);
    this.logger.verbose("ReactorClient initialized");
  }

  private readSubject(subject?: AuthSubject): AuthSubject {
    return subject ?? authSubjectFromSigner(this.signer);
  }

  /**
   * Which scopes of one document the subject may read. Resolved once per
   * document, so the gate builds its model once however many scopes are then
   * tested, and the filtering itself stays synchronous.
   */
  private readableScopes(
    document: PHDocument,
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<(scope: string) => boolean> {
    return this.readGate.scopePredicate(
      document,
      this.readSubject(view?.subject),
      view?.branch ?? "main",
      signal,
    );
  }

  /**
   * One document, filtered to the scopes the subject may read. Every method
   * that hands a document back goes through here, including the ones that
   * follow a write: a document returned from a mutation is a read like any
   * other, and returning it whole served scopes the same subject would be
   * refused by `get`. Its author still sees what it wrote, because an allow on
   * execute confers read of that scope.
   */
  private async gateDocument<TDocument extends PHDocument>(
    document: TDocument,
    view: ViewFilter | undefined,
    signal: AbortSignal | undefined,
  ): Promise<TDocument> {
    const readable = await this.readableScopes(document, view, signal);
    return filterReadableScopes(document, readable);
  }

  /**
   * Retrieves a list of document model modules.
   */
  async getDocumentModelModules(
    namespace?: string,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<DocumentModelModule>> {
    this.logger.verbose(
      "getDocumentModels(@namespace, @paging)",
      namespace,
      paging,
    );
    return this.reactor.getDocumentModels(namespace, paging, signal);
  }

  /**
   * Retrieves a specific document model module by document type.
   *
   * @param documentType - The document type identifier
   * @returns The document model module
   */
  async getDocumentModelModule(
    documentType: string,
  ): Promise<DocumentModelModule<any>> {
    const modules = await this.reactor.getDocumentModels();

    let latestModule: DocumentModelModule | undefined;
    let latestVersion = -1;
    for (const module of modules.results) {
      if (module.documentModel.global.id !== documentType) {
        continue;
      }
      const version = module.version ?? 1;
      if (version > latestVersion) {
        latestVersion = version;
        latestModule = module;
      }
    }

    if (!latestModule) {
      throw new Error(
        `Document model module not found for type: ${documentType}`,
      );
    }

    return latestModule as DocumentModelModule<any>;
  }

  /**
   * Retrieves the document model module matching the version the document is
   * stamped with, so not-yet-upgraded documents get the reducer their
   * history was written with rather than the latest.
   */
  async getDocumentModelModuleForDocument(
    document: PHDocument,
  ): Promise<DocumentModelModule<any>> {
    const documentType = document.header.documentType;
    const version = normalizeDocumentModelVersion(
      (document.state as Partial<typeof document.state>).document?.version,
    );

    const modules = await this.reactor.getDocumentModels();

    const availableVersions: number[] = [];
    for (const module of modules.results) {
      if (module.documentModel.global.id !== documentType) {
        continue;
      }
      const moduleVersion = normalizeDocumentModelVersion(module.version);
      if (moduleVersion === version) {
        return module as DocumentModelModule<any>;
      }
      availableVersions.push(moduleVersion);
    }

    throw new UnsupportedDocumentModelVersionError(
      documentType,
      version,
      availableVersions.sort((a, b) => a - b),
    );
  }

  /**
   * Retrieves a specific PHDocument
   */
  async get<TDocument extends PHDocument>(
    identifier: string,
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    this.logger.verbose("get(@identifier, @view)", identifier, view);
    const document = await this.reactor.getByIdOrSlug<TDocument>(
      identifier,
      withAuthScope(view),
      undefined,
      signal,
    );
    return this.gateDocument(document, view, signal);
  }

  /**
   * Resolves an identifier (id or slug) to the canonical document id, using the
   * same lookup as the data path. Resolves against the "main" branch. Throws if
   * the identifier cannot be resolved or is ambiguous.
   */
  async resolveIdOrSlug(
    identifier: string,
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<string> {
    return this.documentView.resolveIdOrSlug(
      identifier,
      view,
      undefined,
      signal,
    );
  }

  /**
   * Retrieves operations for a document
   */
  async getOperations(
    documentIdentifier: string,
    view?: ViewFilter,
    filter?: OperationFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<Operation>> {
    this.logger.verbose(
      "getOperations(@documentIdentifier, @view, @filter, @paging)",
      documentIdentifier,
      view,
      filter,
      paging,
    );

    const documentId = await this.documentView.resolveIdOrSlug(
      documentIdentifier,
      view,
      undefined,
      signal,
    );

    // Read gate: exclude operations in scopes the subject may not read. The
    // fetch carries the scopes about to be paged, not the policy alone, because
    // a conditional read grant reads the state of the scope it gates; a
    // condition can name no other scope, so the scopes not paged are not owed.
    const gated = await this.reactor.getByIdOrSlug<PHDocument>(
      documentId,
      withAuthScope(view),
      undefined,
      signal,
    );
    const canRead = await this.readableScopes(gated, view, signal);

    if (paging?.cursor && isCompositeCursor(paging.cursor)) {
      return this.getOperationsWithCompositeCursor(
        documentId,
        view,
        filter,
        paging,
        signal,
        canRead,
      );
    }

    const operationsByScope = await this.reactor.getOperations(
      documentId,
      view,
      filter,
      paging,
      undefined,
      signal,
    );

    for (const scope of Object.keys(operationsByScope)) {
      if (!canRead(scope)) {
        delete operationsByScope[scope];
      }
    }

    const scopeEntries = Object.entries(operationsByScope);
    const effectivePaging = paging || { cursor: "0", limit: 100 };

    if (scopeEntries.length <= 1) {
      const allOperations =
        scopeEntries.length === 1 ? [...scopeEntries[0][1].results] : [];
      allOperations.sort((a, b) => a.index - b.index);
      const nextCursor =
        scopeEntries.length === 1 ? scopeEntries[0][1].nextCursor : undefined;
      return { results: allOperations, options: effectivePaging, nextCursor };
    }

    const allOperations: Operation[] = [];
    const activeCursors: Record<string, string> = {};

    for (const [scopeName, scopeResults] of scopeEntries) {
      allOperations.push(...scopeResults.results);
      if (scopeResults.nextCursor) {
        activeCursors[scopeName] = scopeResults.nextCursor;
      }
    }

    allOperations.sort((a, b) => a.index - b.index);

    const nextCursor =
      Object.keys(activeCursors).length > 0
        ? encodeCompositeCursor(activeCursors)
        : undefined;

    return { results: allOperations, options: effectivePaging, nextCursor };
  }

  private async getOperationsWithCompositeCursor(
    documentId: string,
    view: ViewFilter | undefined,
    filter: OperationFilter | undefined,
    paging: PagingOptions,
    signal: AbortSignal | undefined,
    canRead: (scope: string) => boolean,
  ): Promise<PagedResults<Operation>> {
    const scopeCursors = decodeCompositeCursor(paging.cursor);
    const allOperations: Operation[] = [];
    const activeCursors: Record<string, string> = {};

    for (const [scopeName, cursor] of Object.entries(scopeCursors)) {
      if (!canRead(scopeName)) {
        continue;
      }
      const scopeView: ViewFilter = { ...view, scopes: [scopeName] };
      const scopePaging: PagingOptions = { cursor, limit: paging.limit };

      const operationsByScope = await this.reactor.getOperations(
        documentId,
        scopeView,
        filter,
        scopePaging,
        undefined,
        signal,
      );

      const scopeResult = operationsByScope[scopeName];
      allOperations.push(...scopeResult.results);
      if (scopeResult.nextCursor) {
        activeCursors[scopeName] = scopeResult.nextCursor;
      }
    }

    allOperations.sort((a, b) => a.index - b.index);

    const nextCursor =
      Object.keys(activeCursors).length > 0
        ? encodeCompositeCursor(activeCursors)
        : undefined;

    return { results: allOperations, options: paging, nextCursor };
  }

  /**
   * Retrieves outgoing relationships of a given type from a source document.
   */
  async getOutgoingRelationships(
    sourceIdentifier: string,
    relationshipType: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<PHDocument>> {
    this.logger.verbose(
      "getOutgoingRelationships(@sourceIdentifier, @relationshipType, @view, @paging)",
      sourceIdentifier,
      relationshipType,
      view,
      paging,
    );

    const sourceId = await this.documentView.resolveIdOrSlug(
      sourceIdentifier,
      view,
      undefined,
      signal,
    );

    const relationships = await this.documentIndexer.getOutgoing(
      sourceId,
      [relationshipType],
      undefined,
      undefined,
      signal,
    );

    const targetIds = relationships.results.map((rel) => rel.targetId);

    if (targetIds.length === 0) {
      return {
        results: [],
        options: paging || { cursor: "0", limit: 0 },
      };
    }

    return this.find({ ids: targetIds }, view, paging, signal);
  }

  /**
   * Retrieves incoming relationships of a given type to a target document.
   */
  async getIncomingRelationships(
    targetIdentifier: string,
    relationshipType: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<PHDocument>> {
    this.logger.verbose(
      "getIncomingRelationships(@targetIdentifier, @relationshipType, @view, @paging)",
      targetIdentifier,
      relationshipType,
      view,
      paging,
    );

    const targetId = await this.documentView.resolveIdOrSlug(
      targetIdentifier,
      view,
      undefined,
      signal,
    );

    const relationships = await this.documentIndexer.getIncoming(
      targetId,
      [relationshipType],
      undefined,
      undefined,
      signal,
    );

    const sourceIds = relationships.results.map((rel) => rel.sourceId);

    if (sourceIds.length === 0) {
      return {
        results: [],
        options: paging || { cursor: "0", limit: 0 },
      };
    }

    return this.find({ ids: sourceIds }, view, paging, signal);
  }

  /**
   * Filters documents by criteria and returns a list of them
   */
  async find(
    search: SearchFilter,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<PHDocument>> {
    this.logger.verbose("find(@search, @view, @paging)", search, view, paging);
    const results = await this.reactor.find(
      search,
      withAuthScope(view),
      paging,
      undefined,
      signal,
    );
    return {
      ...results,
      results: await Promise.all(
        results.results.map(async (doc) =>
          filterReadableScopes(
            doc,
            await this.readableScopes(doc, view, signal),
          ),
        ),
      ),
    };
  }

  /**
   * Predicts the admission verdict for each candidate. See
   * {@link IReactorClient.evaluateActions} for the contract and its caveats.
   *
   * Read-only throughout, and never through the write cache: that cache is
   * invalidated by whichever process runs the executor, so a reactor running
   * its executors in worker processes would answer here from state no commit
   * ever invalidates.
   */
  async evaluateActions(
    documentIdentifier: string,
    branch: string,
    candidates: ActionCandidate[],
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<ActionEvaluations> {
    this.logger.verbose(
      "evaluateActions(@documentIdentifier, @branch, @count candidates)",
      documentIdentifier,
      branch,
      candidates.length,
    );

    // No model, no answer. The legacy host-table permission system is not
    // consulted and not composed with: see AuthEnforcementDisabledError.
    const config = this.actionEvaluation;
    if (config === undefined) {
      throw new AuthEnforcementDisabledError();
    }

    const subject = this.readSubject(view?.subject);
    const resolvedId = await this.documentView.resolveIdOrSlug(
      documentIdentifier,
      { branch },
      undefined,
      signal,
    );

    // Built once per distinct target rather than once per candidate, so a batch
    // of candidates against one document reads its streams once.
    const targets = new Map<string, EvaluationTarget>();
    const evaluations: Evaluation[] = [];

    for (const candidate of candidates) {
      const targetId = evaluationTargetId(candidate, resolvedId);

      let target = targets.get(targetId);
      if (target === undefined) {
        target = await this.buildEvaluationTarget(
          config,
          targetId,
          branch,
          signal,
        );
        targets.set(targetId, target);
      }

      evaluations.push(decideCandidate(config, target, subject, candidate));
    }

    const allowed = evaluations.filter(
      (evaluation) => evaluation.decision === "allow",
    ).length;

    return {
      evaluations,
      allAllowed: candidates.length > 0 && allowed === candidates.length,
      anyAllowed: allowed > 0,
      allDenied: candidates.length > 0 && allowed === 0,
      anyDenied: allowed < candidates.length,
    };
  }

  /**
   * The decision model for one target document, built at its stream heads.
   *
   * The document is fetched unfiltered, because the policy is what decides:
   * reading it through the read gate would withhold the very scopes the
   * decision is about. A deleted document is served at its deletion boundary,
   * which is what lets the model refuse an execute against it -- authEnforcement
   * requires documentDecisions, so that read is available whenever this runs.
   *
   * Reading past the gate discloses nothing a submit does not. The `auth` and
   * `document` scopes are readable by every holder, so a verdict resting on the
   * policy alone is one the caller could compute unaided; and a verdict resting
   * on a conditional grant reads the executing scope's state exactly as
   * admission reads it, so the answer here is what submitting and being refused
   * would have revealed anyway.
   *
   * The append condition the build records is dropped. It guards a write, and
   * this makes none; reproducing it is also what the preflight cannot do, which
   * is why the answer is a prediction.
   */
  private async buildEvaluationTarget(
    config: ActionEvaluationConfig,
    documentId: string,
    branch: string,
    signal?: AbortSignal,
  ): Promise<EvaluationTarget> {
    const document = await this.documentView.get(
      documentId,
      { branch },
      undefined,
      signal,
    );

    const target = { documentId, branch };
    const built = await buildDecisionModel(
      new SeededStateReader(this.documentView, document, branch),
      config.model,
      target,
      signal,
    );

    return {
      definition: config.model(target),
      model: built.model,
      scopeStates: (document.state ?? {}) as Record<string, unknown>,
    };
  }

  /**
   * Creates a document and waits for completion
   */
  async create<TDocument extends PHDocument = PHDocument>(
    document: PHDocument,
    parentIdentifier?: string,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    this.logger.verbose(
      "create(@id, @parentIdentifier)",
      document.header.id,
      parentIdentifier,
    );

    const documentId = document.header.id;

    const createInput: CreateDocumentActionInput = {
      model: document.header.documentType,
      version: 0,
      documentId,
      signing: {
        signature: documentId,
        publicKey: document.header.sig.publicKey,
        nonce: document.header.sig.nonce,
        createdAtUtcIso: document.header.createdAtUtcIso,
        documentType: document.header.documentType,
      },
      slug: document.header.slug,
      name: document.header.name,
      branch: document.header.branch,
      meta: document.header.meta,
      protocolVersions: document.header.protocolVersions ?? {
        "base-reducer": 2,
      },
    };

    const createActions: Action[] = await signActions(
      [
        createDocumentAction(createInput),
        upgradeDocumentAction({
          documentId,
          model: document.header.documentType,
          fromVersion: 0,
          toVersion: normalizeDocumentModelVersion(
            (document.state as Partial<typeof document.state>).document
              ?.version,
          ),
          initialState: document.state,
        }),
      ],
      this.signer,
      signal,
    );

    const jobs: ExecutionJobPlan[] = [
      {
        key: "create",
        documentId,
        scope: getSharedActionScope(createActions),
        branch: "main",
        actions: createActions,
        dependsOn: [],
      },
    ];

    if (parentIdentifier) {
      const parentActions: Action[] = await signActions(
        [addRelationshipAction(parentIdentifier, documentId, "child")],
        this.signer,
        signal,
      );

      jobs.push({
        key: "parent",
        documentId: parentIdentifier,
        scope: getSharedActionScope(parentActions),
        branch: "main",
        actions: parentActions,
        dependsOn: ["create"],
      });
    }

    const batchResult = await this.reactor.executeBatch({ jobs }, signal);

    const completedJobs = await Promise.all(
      Object.values(batchResult.jobs).map((job) =>
        this.waitForJob(job, signal),
      ),
    );

    for (const job of completedJobs) {
      if (job.status === JobStatus.FAILED) {
        throw new Error(job.error?.message);
      }
    }

    const created = await this.reactor.get<TDocument>(documentId);
    return this.gateDocument(created, undefined, signal);
  }

  /**
   * Creates an empty document and waits for completion
   */
  async createEmpty<TDocument extends PHDocument>(
    documentModelType: string,
    options?: CreateDocumentOptions,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    this.logger.verbose(
      "createEmpty(@documentModelType, @options)",
      documentModelType,
      options,
    );
    const modulesResult = await this.reactor.getDocumentModels(
      undefined,
      undefined,
      signal,
    );

    const matchingModules = modulesResult.results.filter(
      (m) => m.documentModel.global.id === documentModelType,
    );

    let module: DocumentModelModule | undefined;
    if (options?.documentModelVersion !== undefined) {
      const requestedVersion = normalizeDocumentModelVersion(
        options.documentModelVersion,
      );
      module = matchingModules.find(
        (m) => normalizeDocumentModelVersion(m.version) === requestedVersion,
      );
      if (!module) {
        throw new Error(
          `Document model not found for type: ${documentModelType} with version: ${options.documentModelVersion}`,
        );
      }
    } else {
      module = matchingModules.reduce<DocumentModelModule | undefined>(
        (latest, current) => {
          if (latest === undefined) return current;
          const currentVersion = normalizeDocumentModelVersion(current.version);
          const latestVersion = normalizeDocumentModelVersion(latest.version);
          return currentVersion > latestVersion ? current : latest;
        },
        undefined,
      );
      if (!module) {
        throw new Error(
          `Document model not found for type: ${documentModelType}`,
        );
      }
    }

    const document = module.utils.createDocument();
    document.state.document.version = normalizeDocumentModelVersion(
      module.version,
    );

    return this.create<TDocument>(document, options?.parentIdentifier, signal);
  }

  /**
   * Upgrades a document to a newer document model version by dispatching an
   * UPGRADE_DOCUMENT action. When toVersion is omitted, upgrades to the
   * latest registered module version for the document's type. Returns the
   * document unchanged when it is already at the target version.
   *
   * The executor validates the action's version and revision snapshot against
   * the state the migration actually runs on. When a concurrent edit
   * invalidates the snapshot, the upgrade is rebuilt from a fresh read and
   * retried up to maxConflictRetries times before the conflict is surfaced.
   */
  async upgradeDocument<TDocument extends PHDocument = PHDocument>(
    documentIdentifier: string,
    toVersion?: number,
    options?: UpgradeDocumentOptions,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    this.logger.verbose(
      "upgradeDocument(@documentIdentifier, @toVersion)",
      documentIdentifier,
      toVersion,
    );

    const maxConflictRetries =
      options?.maxConflictRetries ?? DEFAULT_UPGRADE_CONFLICT_RETRIES;

    let lastConflictMessage = "";
    for (let attempt = 0; attempt <= maxConflictRetries; attempt++) {
      const document = await this.reactor.getByIdOrSlug<TDocument>(
        documentIdentifier,
        undefined,
        undefined,
        signal,
      );

      const documentId = document.header.id;
      const documentType = document.header.documentType;
      const branch = document.header.branch || "main";
      const fromVersion = normalizeDocumentModelVersion(
        (document.state as Partial<typeof document.state>).document?.version,
      );

      let targetVersion = toVersion;
      if (targetVersion === undefined) {
        const module = await this.getDocumentModelModule(documentType);
        targetVersion = normalizeDocumentModelVersion(module.version);
      }

      if (targetVersion === fromVersion) {
        return this.gateDocument(document, { branch }, signal);
      }
      if (targetVersion < fromVersion) {
        throw new DowngradeNotSupportedError(
          documentType,
          fromVersion,
          targetVersion,
        );
      }

      const action = upgradeDocumentAction({
        documentId,
        model: documentType,
        fromVersion,
        toVersion: targetVersion,
        revision: { ...document.header.revision },
      });

      const signedActions = await signActions([action], this.signer, signal);
      const jobInfo = await this.reactor.execute(
        documentId,
        branch,
        signedActions,
        signal,
      );
      const completedJob = await this.waitForJob(jobInfo, signal);

      if (completedJob.status !== JobStatus.FAILED) {
        const upgraded = await this.reactor.getByIdOrSlug<TDocument>(
          documentId,
          { branch },
          completedJob.consistencyToken,
          signal,
        );
        return this.gateDocument(upgraded, { branch }, signal);
      }

      if (completedJob.error?.name !== "UpgradePreconditionFailedError") {
        throw new Error(completedJob.error?.message);
      }
      lastConflictMessage = completedJob.error.message;
    }

    throw new Error(
      `Upgrade of document ${documentIdentifier} conflicted with concurrent edits after ${maxConflictRetries + 1} attempts: ${lastConflictMessage}`,
    );
  }

  /**
   * Creates an empty document in a drive as a single batched operation.
   * Delegates to {@link IDriveClient.addFile}.
   *
   * @deprecated Use `client.drives.addFile` instead. This method will be
   * removed in a future release.
   */
  async createDocumentInDrive<TDocument extends PHDocument>(
    driveId: string,
    document: PHDocument,
    parentFolder?: string,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    return this.drives.addFile<TDocument>(
      driveId,
      document,
      parentFolder,
      signal,
    );
  }

  /**
   * Applies a list of actions to a document and waits for completion
   */
  async execute<TDocument extends PHDocument>(
    documentIdentifier: string,
    branch: string,
    actions: Action[],
    signal?: AbortSignal,
  ): Promise<TDocument> {
    this.logger.verbose(
      "execute(@documentIdentifier, @branch, @count actions)",
      documentIdentifier,
      branch,
      actions.length,
    );
    const signedActions = await signActions(actions, this.signer, signal);

    const jobInfo = await this.reactor.execute(
      documentIdentifier,
      branch,
      signedActions,
      signal,
    );

    const completedJob = await this.waitForJob(jobInfo, signal);

    if (completedJob.status === JobStatus.FAILED) {
      throw new Error(completedJob.error?.message);
    }

    const view: ViewFilter = { branch };
    const result = await this.reactor.getByIdOrSlug<TDocument>(
      documentIdentifier,
      view,
      completedJob.consistencyToken,
      signal,
    );
    return this.gateDocument(result, view, signal);
  }

  /**
   * Submits a list of actions to a document
   */
  async executeAsync(
    documentIdentifier: string,
    branch: string,
    actions: Action[],
    signal?: AbortSignal,
  ): Promise<JobInfo> {
    this.logger.verbose(
      "executeAsync(@documentIdentifier, @branch, @count actions)",
      documentIdentifier,
      branch,
      actions.length,
    );
    const signedActions = await signActions(actions, this.signer, signal);

    return this.reactor.execute(
      documentIdentifier,
      branch,
      signedActions,
      signal,
    );
  }

  async executeBatch(
    request: BatchExecutionRequest,
    signal?: AbortSignal,
  ): Promise<BatchExecutionResult> {
    this.logger.verbose("executeBatch(@count jobs)", request.jobs.length);

    const signedJobs: ExecutionJobPlan[] = await Promise.all(
      request.jobs.map(async (job) => ({
        ...job,
        actions: await signActions(job.actions, this.signer, signal),
      })),
    );

    const batchResult = await this.reactor.executeBatch(
      { jobs: signedJobs },
      signal,
    );

    const completedJobs = await Promise.all(
      Object.values(batchResult.jobs).map((job) =>
        this.waitForJob(job, signal),
      ),
    );

    for (const job of completedJobs) {
      if (job.status === JobStatus.FAILED) {
        throw new Error(job.error?.message);
      }
    }

    return batchResult;
  }

  /**
   * Renames a document and waits for completion
   */
  async rename(
    documentIdentifier: string,
    name: string,
    branch: string = "main",
    signal?: AbortSignal,
  ): Promise<PHDocument> {
    this.logger.verbose(
      "rename(@documentIdentifier, @name, @branch)",
      documentIdentifier,
      name,
      branch,
    );
    return this.execute(
      documentIdentifier,
      branch,
      [actions.setName(name)],
      signal,
    );
  }

  /**
   * Updates the preferred editor recorded in the document header meta.
   * Pass `null` to clear it.
   */
  async setPreferredEditor(
    documentIdentifier: string,
    preferredEditor: string | null,
    branch: string = "main",
    signal?: AbortSignal,
  ): Promise<PHDocument> {
    this.logger.verbose(
      "setPreferredEditor(@documentIdentifier, @preferredEditor, @branch)",
      documentIdentifier,
      preferredEditor,
      branch,
    );
    return this.execute(
      documentIdentifier,
      branch,
      [actions.setPreferredEditor(preferredEditor)],
      signal,
    );
  }

  /**
   * Adds multiple documents as children to another and waits for completion
   */
  async addRelationship(
    sourceIdentifier: string,
    targetIdentifier: string,
    relationshipType: string,
    branch: string = "main",
    signal?: AbortSignal,
  ): Promise<PHDocument> {
    this.logger.verbose(
      "addRelationship(@sourceIdentifier, @targetIdentifier, @relationshipType, @branch)",
      sourceIdentifier,
      targetIdentifier,
      relationshipType,
      branch,
    );
    const jobInfo = await this.reactor.addRelationship(
      sourceIdentifier,
      targetIdentifier,
      relationshipType,
      branch,
      this.signer,
      signal,
    );

    const completedJob = await this.waitForJob(jobInfo, signal);

    if (completedJob.status === JobStatus.FAILED) {
      throw new Error(completedJob.error?.message);
    }

    const result = await this.reactor.getByIdOrSlug<PHDocument>(
      sourceIdentifier,
      { branch },
      completedJob.consistencyToken,
      signal,
    );
    return this.gateDocument(result, { branch }, signal);
  }

  /**
   * Removes a relationship between two documents and waits for completion.
   */
  async removeRelationship(
    sourceIdentifier: string,
    targetIdentifier: string,
    relationshipType: string,
    branch: string = "main",
    signal?: AbortSignal,
  ): Promise<PHDocument> {
    this.logger.verbose(
      "removeRelationship(@sourceIdentifier, @targetIdentifier, @relationshipType, @branch)",
      sourceIdentifier,
      targetIdentifier,
      relationshipType,
      branch,
    );
    const jobInfo = await this.reactor.removeRelationship(
      sourceIdentifier,
      targetIdentifier,
      relationshipType,
      branch,
      this.signer,
      signal,
    );

    const completedJob = await this.waitForJob(jobInfo, signal);

    if (completedJob.status === JobStatus.FAILED) {
      throw new Error(completedJob.error?.message);
    }

    const result = await this.reactor.getByIdOrSlug<PHDocument>(
      sourceIdentifier,
      { branch },
      completedJob.consistencyToken,
      signal,
    );
    return this.gateDocument(result, { branch }, signal);
  }

  /**
   * Moves a relationship from one source document to another and waits for completion.
   */
  async moveRelationship(
    sourceParentIdentifier: string,
    targetParentIdentifier: string,
    targetIdentifier: string,
    relationshipType: string,
    branch: string = "main",
    signal?: AbortSignal,
  ): Promise<{
    source: PHDocument;
    target: PHDocument;
  }> {
    this.logger.verbose(
      "moveRelationship(@sourceParentIdentifier, @targetParentIdentifier, @targetIdentifier, @relationshipType, @branch)",
      sourceParentIdentifier,
      targetParentIdentifier,
      targetIdentifier,
      relationshipType,
      branch,
    );
    const removeJobInfo = await this.reactor.removeRelationship(
      sourceParentIdentifier,
      targetIdentifier,
      relationshipType,
      branch,
      this.signer,
      signal,
    );

    const removeCompletedJob = await this.waitForJob(removeJobInfo, signal);

    if (removeCompletedJob.status === JobStatus.FAILED) {
      throw new Error(removeCompletedJob.error?.message);
    }

    const addJobInfo = await this.reactor.addRelationship(
      targetParentIdentifier,
      targetIdentifier,
      relationshipType,
      branch,
      this.signer,
      signal,
    );

    const addCompletedJob = await this.waitForJob(addJobInfo, signal);

    if (addCompletedJob.status === JobStatus.FAILED) {
      throw new Error(addCompletedJob.error?.message);
    }

    const sourceResult = await this.reactor.getByIdOrSlug<PHDocument>(
      sourceParentIdentifier,
      { branch },
      removeCompletedJob.consistencyToken,
      signal,
    );

    const targetResult = await this.reactor.getByIdOrSlug<PHDocument>(
      targetParentIdentifier,
      { branch },
      addCompletedJob.consistencyToken,
      signal,
    );

    return {
      source: await this.gateDocument(sourceResult, { branch }, signal),
      target: await this.gateDocument(targetResult, { branch }, signal),
    };
  }

  async loadBatch(
    request: BatchLoadRequest,
    signal?: AbortSignal,
  ): Promise<BatchLoadResult> {
    this.logger.verbose("loadBatch(@count jobs)", request.jobs.length);
    const result = await this.reactor.loadBatch(request, signal);

    const completedJobs = await Promise.all(
      Object.entries(result.jobs).map(async ([key, jobInfo]) => {
        const completed = await this.waitForJob(jobInfo, signal);
        return [key, completed] as const;
      }),
    );

    for (const [, completedJob] of completedJobs) {
      if (completedJob.status === JobStatus.FAILED) {
        throw new Error(completedJob.error?.message);
      }
    }

    return { jobs: Object.fromEntries(completedJobs) };
  }

  /**
   * Deletes a document and waits for completion
   */
  async deleteDocument(
    identifier: string,
    propagate?: PropagationMode,
    signal?: AbortSignal,
  ): Promise<void> {
    this.logger.verbose(
      "deleteDocument(@identifier, @propagate)",
      identifier,
      propagate,
    );
    const jobs: JobInfo[] = [];

    if (propagate === PropagationMode.Cascade) {
      const toDelete = new Set([identifier]);
      let changed = true;

      while (changed) {
        if (signal?.aborted) {
          throw new Error("Operation aborted");
        }
        changed = false;
        const orphans = await this.documentIndexer.getOrphanedChildren(
          [...toDelete],
          ["child"],
          signal,
        );
        for (const id of orphans) {
          if (!toDelete.has(id)) {
            toDelete.add(id);
            changed = true;
          }
        }
      }

      for (const descendantId of toDelete) {
        if (descendantId === identifier) {
          continue;
        }
        const removalJobs = await this.removeAllIncomingRelationships(
          descendantId,
          signal,
        );
        jobs.push(...removalJobs);

        const jobInfo = await this.reactor.deleteDocument(
          descendantId,
          this.signer,
          signal,
        );
        jobs.push(jobInfo);
      }
    }

    const removalJobs = await this.removeAllIncomingRelationships(
      identifier,
      signal,
    );
    jobs.push(...removalJobs);

    const jobInfo = await this.reactor.deleteDocument(
      identifier,
      this.signer,
      signal,
    );
    jobs.push(jobInfo);

    const completedJobs = await Promise.all(
      jobs.map((job) => this.waitForJob(job, signal)),
    );

    for (const completedJob of completedJobs) {
      if (completedJob.status === JobStatus.FAILED) {
        throw new Error(completedJob.error?.message);
      }
    }
  }

  /**
   * Deletes documents and waits for completion
   */
  async deleteDocuments(
    identifiers: string[],
    propagate?: PropagationMode,
    signal?: AbortSignal,
  ): Promise<void> {
    this.logger.verbose(
      "deleteDocuments(@count identifiers, @propagate)",
      identifiers.length,
      propagate,
    );
    const deletePromises = identifiers.map((identifier) =>
      this.deleteDocument(identifier, propagate, signal),
    );

    await Promise.all(deletePromises);
  }

  /**
   * Retrieves the status of a job
   */
  async getJobStatus(jobId: string, signal?: AbortSignal): Promise<JobInfo> {
    this.logger.verbose("getJobStatus(@jobId)", jobId);
    return this.reactor.getJobStatus(jobId, signal);
  }

  /**
   * Waits for a job to complete
   */
  async waitForJob(
    jobId: string | JobInfo,
    signal?: AbortSignal,
  ): Promise<JobInfo> {
    const id = typeof jobId === "string" ? jobId : jobId.id;
    this.logger.verbose("waitForJob(@id)", id);
    return this.jobAwaiter.waitForJob(id, signal);
  }

  /**
   * Subscribes to changes for documents matching specified filters
   */
  subscribe(
    search: SearchFilter,
    callback: (event: DocumentChangeEvent) => void,
    view?: ViewFilter,
  ): () => void {
    this.logger.verbose("subscribe(@search, @view)", search, view);

    // A subscription is a read. The filter lives here because the subscription
    // manager is a read model, which sees everything.
    const readable = async <TDocument extends PHDocument>(
      document: TDocument,
    ): Promise<TDocument> =>
      filterReadableScopes(document, await this.readableScopes(document, view));

    let disposed = false;
    let delivering: Promise<void> = Promise.resolve();

    /**
     * Queues one event behind those already queued. Gating an event resolves
     * asynchronously, so an event needing a group fetch would otherwise be
     * overtaken by the one behind it, and one still in flight would reach a
     * subscriber that has already unsubscribed. Only delivery is ordered, not
     * the gating: a single subscription can cover every document in the
     * reactor, so serializing that work would make its delivery rate the sum
     * of every gate build rather than the slowest. An event that cannot be
     * gated is withheld, because serving it unfiltered would leak the scopes
     * the gate did not clear -- but it is logged rather than swallowed, since
     * the gate rethrows a transient failure precisely so it is not read as a
     * denial.
     */
    const deliver = (
      event: DocumentChangeEvent | Promise<DocumentChangeEvent>,
    ): void => {
      // Attached now, or a rejection while the chain is parked on real I/O
      // waits a full turn with no handler, which Node reports as unhandled.
      void Promise.resolve(event).catch(() => undefined);

      delivering = delivering
        .then(async () => {
          const built = await event;
          if (disposed) {
            return;
          }
          callback(built);
        })
        .catch((error: unknown) => {
          this.logger.error(
            "Subscription delivery failed for @search: @Error",
            { search },
            error,
          );
        });
    };

    const unsubscribeCreated = this.subscriptionManager.onDocumentCreated(
      (result) => {
        deliver(
          (async () => {
            // withAuthScope, or a view that narrows scopes would leave the
            // policy out of the fetch and the gate would read an absent one as
            // uninitialized, which allows everything.
            const documents = await Promise.all(
              result.results.map((id) =>
                this.reactor.get(id, withAuthScope(view), undefined, undefined),
              ),
            );

            return {
              type: DocumentChangeType.Created,
              documents: await Promise.all(documents.map(readable)),
            };
          })(),
        );
      },
      search,
    );

    const unsubscribeDeleted = this.subscriptionManager.onDocumentDeleted(
      (documentIds) => {
        deliver({
          type: DocumentChangeType.Deleted,
          documents: [],
          context: { childId: documentIds[0] },
        });
      },
      search,
    );

    const unsubscribeUpdated = this.subscriptionManager.onDocumentStateUpdated(
      (result) => {
        deliver(
          (async () => ({
            type: DocumentChangeType.Updated,
            documents: await Promise.all(result.results.map(readable)),
          }))(),
        );
      },
      search,
      view,
    );

    const unsubscribeRelationship =
      this.subscriptionManager.onRelationshipChanged(
        (parentId, childId, changeType) => {
          deliver({
            type:
              changeType === RelationshipChangeType.Added
                ? DocumentChangeType.ChildAdded
                : DocumentChangeType.ChildRemoved,
            documents: [],
            context: {
              parentId,
              childId,
            },
          });
        },
        search,
      );

    return () => {
      disposed = true;
      unsubscribeCreated();
      unsubscribeDeleted();
      unsubscribeUpdated();
      unsubscribeRelationship();
    };
  }

  private async removeAllIncomingRelationships(
    documentId: string,
    signal?: AbortSignal,
  ): Promise<JobInfo[]> {
    const incoming = await this.documentIndexer.getIncoming(
      documentId,
      undefined,
      undefined,
      undefined,
      signal,
    );

    const jobs: JobInfo[] = [];
    for (const rel of incoming.results) {
      const jobInfo = await this.reactor.removeRelationship(
        rel.sourceId,
        documentId,
        rel.relationshipType,
        "main",
        this.signer,
        signal,
      );
      jobs.push(jobInfo);
    }
    return jobs;
  }
}
