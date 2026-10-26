import type {
  Action,
  CreateDocumentActionInput,
  DocumentModelModule,
  ISigner,
  PHDocument,
  ProtocolVersions,
  SignaturePolicy,
} from "@powerhousedao/shared/document-model";
import {
  creationActions,
  DowngradeNotSupportedError,
  headNewDocument,
  normalizeDocumentModelVersion,
} from "@powerhousedao/shared/document-model";

export { selectDocumentModelModule } from "@powerhousedao/shared/document-model";
import {
  addRelationshipAction,
  upgradeDocumentAction,
} from "../actions/index.js";
import type { ExecutionJobPlan } from "../core/types.js";
import { getSharedActionScope, signActions } from "../core/utils.js";
import type { ConsistencyToken, JobInfo } from "../shared/types.js";
import { JobStatus } from "../shared/types.js";
import {
  DEFAULT_UPGRADE_CONFLICT_RETRIES,
  type NewDocumentOptions,
  type UpgradeDocumentOptions,
} from "./types.js";

/** The signed jobs that create `document` at `protocolVersions`, and attach it to `parentId`. */
export async function buildCreateJobs(
  document: PHDocument,
  protocolVersions: ProtocolVersions,
  parentId: string | undefined,
  signer: ISigner,
  signal?: AbortSignal,
): Promise<ExecutionJobPlan[]> {
  const documentId = document.header.id;
  const branch = document.header.branch || "main";
  const createActions: Action[] = await signActions(
    creationActions(document, protocolVersions),
    signer,
    { documentId, branch },
    signal,
  );

  const jobs: ExecutionJobPlan[] = [
    {
      key: "create",
      documentId,
      scope: getSharedActionScope(createActions),
      branch,
      actions: createActions,
      dependsOn: [],
    },
  ];

  if (parentId) {
    const parentActions: Action[] = await signActions(
      [addRelationshipAction(parentId, documentId, "child")],
      signer,
      { documentId: parentId, branch: "main" },
      signal,
    );

    jobs.push({
      key: "parent",
      documentId: parentId,
      scope: getSharedActionScope(parentActions),
      branch: "main",
      actions: parentActions,
      dependsOn: ["create"],
    });
  }

  return jobs;
}

/** A new, uncreated document of `module`, under the create defaults given. */
export function createEmptyDocument(
  module: DocumentModelModule,
  options: NewDocumentOptions | undefined,
  defaultPolicy: SignaturePolicy,
  baseVersions: ProtocolVersions,
): PHDocument {
  return headNewDocument(module, options, defaultPolicy, baseVersions);
}

export type UpgradeDocumentDeps = {
  readonly signer: ISigner;
  read<TDocument extends PHDocument>(
    identifier: string,
    branch: string | undefined,
    consistencyToken: ConsistencyToken | undefined,
    signal?: AbortSignal,
  ): Promise<TDocument>;
  getDocumentModelModule(documentType: string): Promise<DocumentModelModule>;
  /** Submits signed actions and returns the job, without waiting. */
  submit(
    documentId: string,
    branch: string,
    actions: Action[],
    signal?: AbortSignal,
  ): Promise<JobInfo>;
  waitForJob(job: JobInfo, signal?: AbortSignal): Promise<JobInfo>;
};

/** Retries from a fresh read when a concurrent edit invalidates the snapshot. */
export async function upgradeDocumentWith<TDocument extends PHDocument>(
  deps: UpgradeDocumentDeps,
  documentIdentifier: string,
  toVersion?: number,
  options?: UpgradeDocumentOptions,
  signal?: AbortSignal,
): Promise<TDocument> {
  const outcome = await upgradeDocumentJob<TDocument>(
    deps,
    documentIdentifier,
    toVersion,
    options,
    signal,
  );
  if (outcome.kind === "unchanged") {
    return outcome.document;
  }
  return deps.read<TDocument>(
    outcome.documentId,
    outcome.branch,
    outcome.job.consistencyToken,
    signal,
  );
}

/** What an upgrade came to: nothing to do, or a job that settled. */
export type UpgradeOutcome<TDocument extends PHDocument> =
  | {
      kind: "unchanged";
      /** The document as read, already at the target version. */
      document: TDocument;
      documentId: string;
      branch: string;
    }
  | {
      kind: "upgraded";
      /** The upgrade's job, settled and not FAILED. */
      job: JobInfo;
      documentId: string;
      branch: string;
    };

/**
 * {@link upgradeDocumentWith} up to the read-back: retries from a fresh read
 * when a concurrent edit invalidates the snapshot, and returns the settled job
 * rather than the upgraded document.
 */
export async function upgradeDocumentJob<TDocument extends PHDocument>(
  deps: UpgradeDocumentDeps,
  documentIdentifier: string,
  toVersion?: number,
  options?: UpgradeDocumentOptions,
  signal?: AbortSignal,
): Promise<UpgradeOutcome<TDocument>> {
  const maxConflictRetries =
    options?.maxConflictRetries ?? DEFAULT_UPGRADE_CONFLICT_RETRIES;

  let lastConflictMessage = "";
  for (let attempt = 0; attempt <= maxConflictRetries; attempt++) {
    const document = await deps.read<TDocument>(
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
      const module = await deps.getDocumentModelModule(documentType);
      targetVersion = normalizeDocumentModelVersion(module.version);
    }

    if (targetVersion === fromVersion) {
      return { kind: "unchanged", document, documentId, branch };
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

    const signedActions = await signActions(
      [action],
      deps.signer,
      { documentId, branch },
      signal,
    );
    const jobInfo = await deps.submit(
      documentId,
      branch,
      signedActions,
      signal,
    );
    const completedJob = await deps.waitForJob(jobInfo, signal);

    if (completedJob.status !== JobStatus.FAILED) {
      return { kind: "upgraded", job: completedJob, documentId, branch };
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
