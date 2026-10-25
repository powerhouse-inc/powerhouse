import type {
  Action,
  AuthSubject,
  ISigner,
  PHDocument,
  SignaturePolicy,
} from "@powerhousedao/shared/document-model";
import { actions } from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import type {
  BatchExecutionRequest,
  BatchExecutionResult,
  BatchLoadRequest,
  BatchLoadResult,
  ExecutionJobPlan,
  IReactor,
} from "../core/types.js";
import { signActions } from "../core/utils.js";
import { buildDecisionModel } from "../decision/build-decision-model.js";
import { SeededStateReader } from "../decision/read-gate.js";
import type { Evaluation } from "../decision/types.js";
import {
  AuthEnforcementDisabledError,
  RelationshipNotFoundError,
} from "../shared/errors.js";
import {
  JobStatus,
  PropagationMode,
  type ConsistencyToken,
  type JobInfo,
} from "../shared/types.js";
import { DocumentExistence } from "../storage/interfaces.js";
import type {
  DocumentRelationship,
  IDocumentIndexer,
  IDocumentView,
} from "../storage/interfaces.js";
import {
  buildCreateJobs,
  createEmptyDocument,
  selectDocumentModelModule,
  upgradeDocumentJob,
} from "./derivations.js";
import { DriveWriteClient } from "./drive-write-client.js";
import {
  decideCandidate,
  evaluationTargetId,
  type ActionEvaluationConfig,
  type EvaluationTarget,
} from "./internal/evaluation.js";
import { ReadGating } from "./internal/gating.js";
import {
  awaiterStagePort,
  JobBatchHandle,
  WriteHandleFactory,
  type HandleReader,
  type JobSetHandle,
} from "./internal/handles.js";
import type { ReactorClientParts } from "./internal/parts.js";
import { deletePlanKey, planDelete, planRemoval } from "./internal/signing.js";
import { WriteTargets } from "./internal/targets.js";
import type { ReactorReadClient } from "./read-client.js";
import type {
  ActionCandidate,
  ActionEvaluations,
  BatchWriteHandle,
  CreateDocumentOptions,
  IDriveWriteClient,
  IReactorWriteClient,
  MoveRelationshipHandles,
  UpgradeDocumentOptions,
  WriteHandle,
  WriteTargetDescription,
} from "./types.js";
import { withAuthScope } from "./util.js";

/** A submitted execute: the accepted job and the id it was stored under. */
export type SubmittedExecution = {
  job: JobInfo;
  documentId: string;
};

/**
 * The in-process write half of the reactor client: signs, resolves targets and
 * enqueues. Every write resolves once its job is accepted and returns a
 * {@link WriteHandle}; a write that has to know an earlier step's outcome
 * before submitting the next (a relationship move, an upgrade retried against
 * concurrent edits) waits for that step itself.
 *
 * Holds the read half for what a write needs to read: creation defaults,
 * model lookups and the read-back a handle's `document()` makes.
 */
export class ReactorWriteClient implements IReactorWriteClient {
  readonly drives: IDriveWriteClient;

  private readonly logger: ILogger;
  private readonly reactor: IReactor;
  private readonly signer: ISigner;
  private readonly documentIndexer: IDocumentIndexer;
  private readonly documentView: IDocumentView;
  private readonly gating: ReadGating;
  private readonly targets: WriteTargets;
  private readonly handles: WriteHandleFactory;
  private readonly actionEvaluation: ActionEvaluationConfig | undefined;
  private readonly createSignaturePolicy: SignaturePolicy;
  private readonly read: ReactorReadClient;

  constructor(parts: ReactorClientParts, read: ReactorReadClient) {
    this.logger = parts.logger;
    this.reactor = parts.reactor;
    this.signer = parts.signer;
    this.documentIndexer = parts.documentIndexer;
    this.documentView = parts.documentView;
    this.gating = new ReadGating(
      parts.reactor,
      parts.documentView,
      parts.readGate,
      parts.signer,
    );
    this.targets = new WriteTargets(parts.documentView, parts.documentIndexer);
    this.handles = new WriteHandleFactory(awaiterStagePort(parts.jobAwaiter));
    this.actionEvaluation = parts.actionEvaluation;
    this.createSignaturePolicy = parts.createSignaturePolicy;
    this.read = read;
    this.drives = new DriveWriteClient(
      this,
      read,
      this.handles,
      parts.logger,
      (request, signal) => parts.reactor.executeBatch(request, signal),
      parts.signer,
      (identifier, signal) =>
        this.targets.resolveReference(identifier, "main", signal),
    );
  }

  async isDocumentIdTaken(
    documentId: string,
    signal?: AbortSignal,
  ): Promise<boolean> {
    this.logger.verbose("isDocumentIdTaken(@documentId)", documentId);
    const taken = await this.documentView.exists(
      [documentId],
      DocumentExistence.IncludingDeleted,
      undefined,
      signal,
    );
    return taken[0];
  }

  /**
   * Resolves the reference as a mutation does, then describes the document from
   * the document view, ungated. The write-side identity table replaces the view
   * here without changing the answer's shape.
   */
  async describe(
    identifier: string,
    branch: string = "main",
    signal?: AbortSignal,
  ): Promise<WriteTargetDescription> {
    this.logger.verbose("describe(@identifier, @branch)", identifier, branch);
    const documentId = await this.targets.resolveReference(
      identifier,
      branch,
      signal,
    );
    const document = await this.documentView.get(
      documentId,
      { branch },
      undefined,
      signal,
    );
    return {
      documentId: document.header.id,
      documentType: document.header.documentType,
      slug: document.header.slug,
      branch: document.header.branch || branch,
      revision: { ...document.header.revision },
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
    subject?: AuthSubject,
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

    const decidedSubject = this.gating.readSubject(subject);
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
      // CREATE_DOCUMENT is exempt from the executor's policy gate by necessity:
      // it runs before the document exists, so there is no policy to decide
      // against (see GATED_DOCUMENT_ACTIONS). Mirror the exemption rather than
      // deciding the candidate against the named document's policy, which would
      // predict a denial the submit path never issues.
      if (candidate.type === "CREATE_DOCUMENT") {
        evaluations.push({ decision: "allow" });
        continue;
      }

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

      evaluations.push(
        decideCandidate(config, target, decidedSubject, candidate),
      );
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

  async create(
    document: PHDocument,
    parentIdentifier?: string,
    signal?: AbortSignal,
  ): Promise<WriteHandle> {
    this.logger.verbose(
      "create(@id, @parentIdentifier)",
      document.header.id,
      parentIdentifier,
    );

    const batchResult = await this.submitCreate(
      document,
      parentIdentifier,
      signal,
    );
    return this.createHandle(document, batchResult, signal);
  }

  /** Signs and submits a document's create batch without waiting for it. */
  async submitCreate(
    document: PHDocument,
    parentIdentifier: string | undefined,
    signal: AbortSignal | undefined,
  ): Promise<BatchExecutionResult> {
    const parentId = parentIdentifier
      ? await this.targets.resolveReference(parentIdentifier, "main", signal)
      : undefined;
    const jobs = await buildCreateJobs(document, parentId, this.signer, signal);
    return this.reactor.executeBatch({ jobs }, signal);
  }

  async createEmpty(
    documentModelType: string,
    options?: CreateDocumentOptions,
    signal?: AbortSignal,
  ): Promise<WriteHandle> {
    this.logger.verbose(
      "createEmpty(@documentModelType, @options)",
      documentModelType,
      options,
    );
    const document = await this.emptyDocument(
      documentModelType,
      options,
      signal,
    );
    return this.create(document, options?.parentIdentifier, signal);
  }

  /** A new, empty document of the type, under this client's create defaults. */
  async emptyDocument(
    documentModelType: string,
    options: CreateDocumentOptions | undefined,
    signal: AbortSignal | undefined,
  ): Promise<PHDocument> {
    const modulesResult = await this.reactor.getDocumentModels(
      undefined,
      undefined,
      signal,
    );
    const module = selectDocumentModelModule(
      modulesResult.results,
      documentModelType,
      options?.documentModelVersion,
    );
    const base = await this.read.getCreateProtocolVersions(
      options?.parentIdentifier,
      signal,
    );
    return createEmptyDocument(
      module,
      options,
      this.createSignaturePolicy,
      base,
    );
  }

  async upgradeDocument(
    documentIdentifier: string,
    toVersion?: number,
    options?: UpgradeDocumentOptions,
    signal?: AbortSignal,
  ): Promise<WriteHandle> {
    this.logger.verbose(
      "upgradeDocument(@documentIdentifier, @toVersion)",
      documentIdentifier,
      toVersion,
    );
    const outcome = await upgradeDocumentJob(
      {
        signer: this.signer,
        read: <T extends PHDocument>(
          identifier: string,
          branch: string | undefined,
          consistencyToken: ConsistencyToken | undefined,
          readSignal?: AbortSignal,
        ) =>
          this.reactor.getByIdOrSlug<T>(
            identifier,
            branch === undefined ? undefined : { branch },
            consistencyToken,
            readSignal,
          ),
        getDocumentModelModule: (documentType) =>
          this.read.getDocumentModelModule(documentType),
        submit: (documentId, branch, actions, submitSignal) =>
          this.reactor.execute(documentId, branch, actions, submitSignal),
        waitForJob: (job, waitSignal) => this.read.waitForJob(job, waitSignal),
      },
      documentIdentifier,
      toVersion,
      options,
      signal,
    );

    if (outcome.kind === "unchanged") {
      const unchanged = outcome.document;
      return this.handles.settled(
        outcome.documentId,
        outcome.branch,
        <T extends PHDocument>(
          receipt: { branch: string },
          view: Parameters<HandleReader>[1],
          readSignal: AbortSignal | undefined,
        ) =>
          this.gating.gateDocument(
            unchanged as unknown as T,
            { ...view, branch: receipt.branch },
            readSignal,
          ),
      );
    }

    return this.handles.forSettledJob(
      outcome.job,
      outcome.documentId,
      outcome.branch,
      this.readerById(outcome.documentId),
    );
  }

  async execute(
    documentIdentifier: string,
    branch: string,
    actions: Action[],
    signal?: AbortSignal,
  ): Promise<WriteHandle> {
    this.logger.verbose(
      "execute(@documentIdentifier, @branch, @count actions)",
      documentIdentifier,
      branch,
      actions.length,
    );
    const submitted = await this.submitExecute(
      documentIdentifier,
      branch,
      actions,
      signal,
    );
    return this.handles.forJob(
      submitted.job,
      submitted.documentId,
      branch,
      signal,
      this.readerById(submitted.documentId),
    );
  }

  /** Resolves the target, signs the actions and submits them without waiting. */
  async submitExecute(
    documentIdentifier: string,
    branch: string,
    actions: Action[],
    signal?: AbortSignal,
  ): Promise<SubmittedExecution> {
    const documentId = await this.targets.resolveWriteTarget(
      documentIdentifier,
      branch,
      actions,
      signal,
    );
    const signedActions = await signActions(
      actions,
      this.signer,
      { documentId, branch },
      signal,
    );

    const job = await this.reactor.execute(
      documentId,
      branch,
      signedActions,
      signal,
    );
    return { job, documentId };
  }

  async executeBatch(
    request: BatchExecutionRequest,
    signal?: AbortSignal,
  ): Promise<BatchWriteHandle> {
    this.logger.verbose("executeBatch(@count jobs)", request.jobs.length);

    const signedJobs: ExecutionJobPlan[] = await Promise.all(
      request.jobs.map(async (job) => {
        const documentId = await this.targets.resolveWriteTarget(
          job.documentId,
          job.branch,
          job.actions,
          signal,
        );
        return {
          ...job,
          documentId,
          actions: await signActions(
            job.actions,
            this.signer,
            { documentId, branch: job.branch },
            signal,
          ),
        };
      }),
    );

    const batchResult = await this.reactor.executeBatch(
      { jobs: signedJobs },
      signal,
    );

    const plans = new Map(signedJobs.map((plan) => [plan.key, plan]));
    const handles: Record<string, JobSetHandle> = {};
    for (const [key, job] of Object.entries(batchResult.jobs)) {
      const plan = plans.get(key);
      const documentId = plan?.documentId ?? job.documentId;
      handles[key] = this.handles.forJob(
        job,
        documentId,
        plan?.branch ?? "main",
        signal,
        this.readerById(documentId),
      );
    }

    return new JobBatchHandle(
      batchResult.jobs,
      handles,
      signedJobs.map((plan) => plan.key),
    );
  }

  async rename(
    documentIdentifier: string,
    name: string,
    branch: string = "main",
    signal?: AbortSignal,
  ): Promise<WriteHandle> {
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

  async setPreferredEditor(
    documentIdentifier: string,
    preferredEditor: string | null,
    branch: string = "main",
    signal?: AbortSignal,
  ): Promise<WriteHandle> {
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

  async addRelationship(
    sourceIdentifier: string,
    targetIdentifier: string,
    relationshipType: string,
    metadata?: Record<string, unknown>,
    branch: string = "main",
    signal?: AbortSignal,
  ): Promise<WriteHandle> {
    this.logger.verbose(
      "addRelationship(@sourceIdentifier, @targetIdentifier, @relationshipType, @metadata, @branch)",
      sourceIdentifier,
      targetIdentifier,
      relationshipType,
      metadata,
      branch,
    );
    const sourceId = await this.targets.resolveReference(
      sourceIdentifier,
      branch,
      signal,
    );
    const targetId = await this.targets.resolveReference(
      targetIdentifier,
      branch,
      signal,
    );
    const job = await this.reactor.addRelationship(
      sourceId,
      targetId,
      relationshipType,
      metadata,
      branch,
      this.signer,
      signal,
    );
    return this.handles.forJob(
      job,
      sourceId,
      branch,
      signal,
      this.readerById(sourceId),
    );
  }

  async updateRelationship(
    sourceIdentifier: string,
    targetIdentifier: string,
    relationshipType: string,
    metadata: Record<string, unknown> | null,
    branch: string = "main",
    signal?: AbortSignal,
  ): Promise<WriteHandle> {
    this.logger.verbose(
      "updateRelationship(@sourceIdentifier, @targetIdentifier, @relationshipType, @metadata, @branch)",
      sourceIdentifier,
      targetIdentifier,
      relationshipType,
      metadata,
      branch,
    );
    const sourceId = await this.targets.resolveReference(
      sourceIdentifier,
      branch,
      signal,
    );
    const targetId = await this.targets.resolveReference(
      targetIdentifier,
      branch,
      signal,
    );

    // The write matches the edge in SQL and reports no row count, so an update
    // of an edge that is not there reaches READ_READY having stored nothing.
    const existing = await this.targets.readRelationshipEdge(
      sourceId,
      targetId,
      relationshipType,
      { branch },
      signal,
    );
    if (!existing) {
      throw new RelationshipNotFoundError(
        sourceIdentifier,
        targetIdentifier,
        relationshipType,
      );
    }

    const job = await this.reactor.updateRelationship(
      sourceId,
      targetId,
      relationshipType,
      metadata,
      branch,
      this.signer,
      signal,
    );
    return this.handles.forJob(
      job,
      sourceId,
      branch,
      signal,
      this.readerById(sourceId),
    );
  }

  async removeRelationship(
    sourceIdentifier: string,
    targetIdentifier: string,
    relationshipType: string,
    branch: string = "main",
    signal?: AbortSignal,
  ): Promise<WriteHandle> {
    this.logger.verbose(
      "removeRelationship(@sourceIdentifier, @targetIdentifier, @relationshipType, @branch)",
      sourceIdentifier,
      targetIdentifier,
      relationshipType,
      branch,
    );
    const sourceId = await this.targets.resolveReference(
      sourceIdentifier,
      branch,
      signal,
    );
    const targetId = await this.targets.resolveReference(
      targetIdentifier,
      branch,
      signal,
    );
    const job = await this.reactor.removeRelationship(
      sourceId,
      targetId,
      relationshipType,
      branch,
      this.signer,
      signal,
    );
    return this.handles.forJob(
      job,
      sourceId,
      branch,
      signal,
      this.readerById(sourceId),
    );
  }

  async moveRelationship(
    sourceParentIdentifier: string,
    targetParentIdentifier: string,
    targetIdentifier: string,
    relationshipType: string,
    branch: string = "main",
    signal?: AbortSignal,
  ): Promise<MoveRelationshipHandles> {
    this.logger.verbose(
      "moveRelationship(@sourceParentIdentifier, @targetParentIdentifier, @targetIdentifier, @relationshipType, @branch)",
      sourceParentIdentifier,
      targetParentIdentifier,
      targetIdentifier,
      relationshipType,
      branch,
    );
    const sourceParentId = await this.targets.resolveReference(
      sourceParentIdentifier,
      branch,
      signal,
    );
    const targetParentId = await this.targets.resolveReference(
      targetParentIdentifier,
      branch,
      signal,
    );
    const targetId = await this.targets.resolveReference(
      targetIdentifier,
      branch,
      signal,
    );

    // A move is a remove followed by an add, and the add would otherwise write a
    // fresh edge with no metadata. Read the edge first so the move carries it.
    // A failed read aborts the move: once the remove has run, "the edge carried
    // no metadata" and "the read did not answer" are indistinguishable, and
    // treating the second as the first rewrites the edge with no metadata for
    // good.
    const edge = await this.targets.readRelationshipEdge(
      sourceParentId,
      targetId,
      relationshipType,
      { branch },
      signal,
    );
    const metadata = edge?.metadata;

    const removeJob = await this.reactor.removeRelationship(
      sourceParentId,
      targetId,
      relationshipType,
      branch,
      this.signer,
      signal,
    );
    const removed = this.handles.forJob(
      removeJob,
      sourceParentId,
      branch,
      signal,
      this.readerById(sourceParentId),
    );

    // The add must not land on top of a remove that failed.
    await removed.readable;

    const addJob = await this.reactor.addRelationship(
      targetParentId,
      targetId,
      relationshipType,
      metadata,
      branch,
      this.signer,
      signal,
    );
    const added = this.handles.forJob(
      addJob,
      targetParentId,
      branch,
      signal,
      this.readerById(targetParentId),
    );

    return { removed, added };
  }

  async loadBatch(
    request: BatchLoadRequest,
    signal?: AbortSignal,
  ): Promise<BatchLoadResult> {
    this.logger.verbose("loadBatch(@count jobs)", request.jobs.length);
    const result = await this.reactor.loadBatch(request, signal);

    const completedJobs = await Promise.all(
      Object.entries(result.jobs).map(async ([key, jobInfo]) => {
        const completed = await this.read.waitForJob(jobInfo, signal);
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

  async deleteDocument(
    identifier: string,
    propagate?: PropagationMode,
    signal?: AbortSignal,
  ): Promise<WriteHandle> {
    this.logger.verbose(
      "deleteDocument(@identifier, @propagate)",
      identifier,
      propagate,
    );
    const rootId = await this.targets.resolveReference(
      identifier,
      "main",
      signal,
    );
    const toDelete = new Set([rootId]);

    if (propagate === PropagationMode.Cascade) {
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
    }

    // Discovery puts sources before targets; reversed, children go first.
    const order = [...toDelete].reverse();
    const position = new Map(order.map((id, index) => [id, index]));
    const incoming = new Map<string, DocumentRelationship[]>();
    for (const documentId of order) {
      const page = await this.documentIndexer.getIncoming(
        documentId,
        undefined,
        undefined,
        undefined,
        signal,
      );
      incoming.set(documentId, page.results);
    }
    // An edge whose source is deleted no later than its target cannot wait.
    const waitsForTarget = (rel: DocumentRelationship): boolean => {
      const source = position.get(rel.sourceId);
      return source === undefined || source > position.get(rel.targetId)!;
    };
    const leadingBySource = new Map<string, DocumentRelationship[]>();
    for (const rels of incoming.values()) {
      for (const rel of rels) {
        if (waitsForTarget(rel)) continue;
        const leading = leadingBySource.get(rel.sourceId) ?? [];
        leading.push(rel);
        leadingBySource.set(rel.sourceId, leading);
      }
    }

    const plans: ExecutionJobPlan[] = [];
    for (const documentId of order) {
      for (const rel of leadingBySource.get(documentId) ?? []) {
        plans.push(
          await planRemoval(this.signer, rel, [], plans.length, signal),
        );
      }
      plans.push(await planDelete(this.signer, documentId, signal));
      for (const rel of incoming.get(documentId)!) {
        if (waitsForTarget(rel)) {
          plans.push(
            await planRemoval(
              this.signer,
              rel,
              [deletePlanKey(documentId)],
              plans.length,
              signal,
            ),
          );
        }
      }
    }

    const batchResult = await this.reactor.executeBatch(
      { jobs: plans },
      signal,
    );

    const jobs = Object.values(batchResult.jobs);
    const rootJob = batchResult.jobs[deletePlanKey(rootId)] ?? jobs[0];
    return this.handles.forJobs(
      rootJob.id,
      jobs,
      rootId,
      "main",
      signal,
      this.readerById(rootId),
    );
  }

  async deleteDocuments(
    identifiers: string[],
    propagate?: PropagationMode,
    signal?: AbortSignal,
  ): Promise<WriteHandle[]> {
    this.logger.verbose(
      "deleteDocuments(@count identifiers, @propagate)",
      identifiers.length,
      propagate,
    );
    return Promise.all(
      identifiers.map((identifier) =>
        this.deleteDocument(identifier, propagate, signal),
      ),
    );
  }

  /** The id a document reference names; see {@link WriteTargets}. */
  resolveReference(
    identifier: string,
    branch: string,
    signal?: AbortSignal,
  ): Promise<string> {
    return this.targets.resolveReference(identifier, branch, signal);
  }

  /**
   * The read-back of a create. Without a view it is the read a create has
   * always made: by id, on the job's own completion, gated as the writer. With
   * a view it reads through that view, bounded by the receipt's token.
   */
  private createReader(): HandleReader {
    return async <T extends PHDocument>(
      receipt: { documentId: string; token: ConsistencyToken },
      view: Parameters<HandleReader>[1],
      signal: AbortSignal | undefined,
    ): Promise<T> => {
      const created =
        view === undefined
          ? await this.reactor.get<T>(receipt.documentId)
          : await this.reactor.get<T>(
              receipt.documentId,
              withAuthScope(view),
              receipt.token,
              signal,
            );
      return this.gating.gateDocument(created, view, signal);
    };
  }

  /** Reads the document back through the read half, with the receipt's token. */
  private readerById(documentId: string): HandleReader {
    return <T extends PHDocument>(
      receipt: { branch: string; token: ConsistencyToken },
      view: Parameters<HandleReader>[1],
      signal: AbortSignal | undefined,
    ): Promise<T> =>
      this.read.get<T>(
        documentId,
        { ...view, branch: receipt.branch },
        signal,
        receipt.token,
      );
  }

  private createHandle(
    document: PHDocument,
    batchResult: BatchExecutionResult,
    signal: AbortSignal | undefined,
  ): JobSetHandle {
    const jobs = Object.values(batchResult.jobs);
    const createJob = batchResult.jobs.create ?? jobs[0];
    return this.handles.forJobs(
      createJob.id,
      jobs,
      document.header.id,
      document.header.branch || "main",
      signal,
      this.createReader(),
    );
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
}
