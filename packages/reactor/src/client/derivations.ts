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
  DowngradeNotSupportedError,
  normalizeDocumentModelVersion,
  requestedSignaturePolicy,
  withSignaturePolicy,
} from "@powerhousedao/shared/document-model";
import {
  addRelationshipAction,
  createDocumentAction,
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

/** CREATE_DOCUMENT and UPGRADE_DOCUMENT for `document` at `protocolVersions`, unsigned. */
export function buildCreateActions(
  document: PHDocument,
  protocolVersions: ProtocolVersions,
): Action[] {
  const { header } = document;
  const createInput: CreateDocumentActionInput = {
    model: header.documentType,
    version: 0,
    documentId: header.id,
    signing: {
      signature: header.id,
      publicKey: header.sig.publicKey,
      nonce: header.sig.nonce,
      createdAtUtcIso: header.createdAtUtcIso,
      documentType: header.documentType,
    },
    slug: header.slug,
    name: header.name,
    branch: header.branch,
    meta: header.meta,
    protocolVersions,
  };
  return [
    createDocumentAction(createInput),
    upgradeDocumentAction({
      documentId: header.id,
      model: header.documentType,
      fromVersion: 0,
      // imported documents may predate the document scope entirely
      toVersion: normalizeDocumentModelVersion(
        (document.state as Partial<typeof document.state>).document?.version,
      ),
      initialState: document.state,
    }),
  ];
}

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
    buildCreateActions(document, protocolVersions),
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

/** The registered module for a type: the requested version, else the latest. */
export function selectDocumentModelModule(
  modules: readonly DocumentModelModule[],
  documentModelType: string,
  documentModelVersion?: number,
): DocumentModelModule {
  const matching = modules.filter(
    (m) => m.documentModel.global.id === documentModelType,
  );

  if (documentModelVersion !== undefined) {
    const requested = normalizeDocumentModelVersion(documentModelVersion);
    const module = matching.find(
      (m) => normalizeDocumentModelVersion(m.version) === requested,
    );
    if (!module) {
      throw new Error(
        `Document model not found for type: ${documentModelType} with version: ${documentModelVersion}`,
      );
    }
    return module;
  }

  const latest = matching.reduce<DocumentModelModule | undefined>(
    (best, current) => {
      if (best === undefined) return current;
      const currentVersion = normalizeDocumentModelVersion(current.version);
      const bestVersion = normalizeDocumentModelVersion(best.version);
      return currentVersion > bestVersion ? current : best;
    },
    undefined,
  );
  if (!latest) {
    throw new Error(`Document model not found for type: ${documentModelType}`);
  }
  return latest;
}

/** A new, uncreated document of `module`, under the create defaults given. */
export function createEmptyDocument(
  module: DocumentModelModule,
  options: NewDocumentOptions | undefined,
  defaultPolicy: SignaturePolicy,
  baseVersions: ProtocolVersions,
): PHDocument {
  const document = withSignaturePolicy(
    module.utils.createDocument(options?.initialState),
    requestedSignaturePolicy(options, defaultPolicy),
    {
      id: options?.id,
      protocolVersions: { ...baseVersions, ...options?.protocolVersions },
    },
  );
  document.state.document.version = normalizeDocumentModelVersion(
    module.version,
  );
  if (options?.name !== undefined) {
    document.header.name = options.name;
  }
  return document;
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
      return document;
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
      return deps.read<TDocument>(
        documentId,
        branch,
        completedJob.consistencyToken,
        signal,
      );
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
