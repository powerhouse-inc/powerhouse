import type {
  ConsistencyToken,
  WriteHandle,
  WriteReceipt,
} from "@powerhousedao/reactor";
import { deleteNode } from "@powerhousedao/shared/document-drive";
import type {
  Action,
  AuthSubject,
  DocumentModelModule,
  OperationOutcome,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import { operationOutcome } from "@powerhousedao/shared/document-model";
import { pascalCase } from "change-case";
import type { ReactorToolClient, ReactorToolReadClient } from "./client.js";
import {
  DEFAULT_BRANCH,
  DRIVE_DOCUMENT_TYPE,
  DRIVE_DOCUMENT_TYPES,
} from "./documents.js";
import {
  ReactorToolError,
  toReactorToolError,
  type ActionFailure,
} from "./errors.js";
import { unknownValueMessage } from "./suggest.js";
import {
  actionFailuresError,
  validateActions,
  type ActionInput,
  type ValidateActionsOptions,
} from "./validation.js";

export type Revision = Record<string, number>;

export type GetDocumentOptions = {
  branch?: string;
  /** A write receipt's token, to read after that write. */
  token?: ConsistencyToken;
};

export async function getDocument<T extends PHDocument = PHDocument>(
  client: ReactorToolReadClient,
  identifier: string,
  signal?: AbortSignal,
  options: GetDocumentOptions = {},
): Promise<T> {
  const { branch, token } = options;
  try {
    return await client.get<T>(
      identifier,
      branch ? { branch } : undefined,
      signal,
      token,
    );
  } catch (error) {
    throw toReactorToolError(error, "NOT_FOUND");
  }
}

/** The model module for a type; an unknown type fails with did-you-mean. */
export async function getDocumentModel(
  client: ReactorToolReadClient,
  documentType: string,
  signal?: AbortSignal,
): Promise<DocumentModelModule> {
  try {
    return await client.getDocumentModelModule(documentType);
  } catch (error) {
    const known = await client
      .getDocumentModelModules(undefined, undefined, signal)
      .then((r) => r.results.map((m) => m.documentModel.global.id))
      .catch(() => []);
    throw new ReactorToolError(
      "NOT_FOUND",
      unknownValueMessage("document type", documentType, known, {
        knownLabel: "Known types",
      }),
      { cause: error },
    );
  }
}

const OPERATIONS_PAGE_SIZE = 100;

/** What became of one action: the operation it was stored as and its outcome. */
type StoredOutcome = { operationIndex: number } & OperationOutcome;

// The operations the write appended, by action id.
async function storedOutcomes(
  client: ReactorToolReadClient,
  documentId: string,
  branch: string,
  actions: readonly Action[],
  before: Revision,
  signal?: AbortSignal,
): Promise<Map<string, StoredOutcome>> {
  const ids = new Set(actions.map((a) => a.id));
  const outcomes = new Map<string, StoredOutcome>();
  for (const scope of new Set(actions.map((a) => a.scope))) {
    let cursor: string | undefined = "0";
    while (cursor !== undefined) {
      const page = await client.getOperations(
        documentId,
        { branch, scopes: [scope] },
        { sinceRevision: before[scope] ?? 0 },
        { cursor, limit: OPERATIONS_PAGE_SIZE },
        signal,
      );
      for (const operation of page.results) {
        if (!ids.has(operation.action.id)) continue;
        outcomes.set(operation.action.id, {
          operationIndex: operation.index,
          ...operationOutcome(operation),
        });
      }
      cursor = page.results.length > 0 ? page.nextCursor : undefined;
    }
  }
  return outcomes;
}

async function readable(handle: Promise<WriteHandle>): Promise<WriteReceipt> {
  return (await handle).readable;
}

// The job's result names each action's outcome; a remote client's job may
// carry none, so the stored operations are read instead.
async function actionOutcomes(
  client: ReactorToolReadClient,
  receipt: WriteReceipt,
  actions: readonly Action[],
  before: Revision,
  signal?: AbortSignal,
): Promise<Map<string, StoredOutcome>> {
  const summary = receipt.job.result;
  if (summary) {
    return new Map(
      summary.actions.map((a) => [
        a.actionId,
        { ...a, operationIndex: a.index },
      ]),
    );
  }
  return storedOutcomes(
    client,
    receipt.documentId,
    receipt.branch,
    actions,
    before,
    signal,
  );
}

async function revisionAfter(
  client: ReactorToolReadClient,
  receipt: WriteReceipt,
  signal?: AbortSignal,
): Promise<Revision> {
  const document = await getDocument(client, receipt.documentId, signal, {
    branch: receipt.branch,
    token: receipt.token,
  });
  return { ...document.header.revision };
}

/** An action a piece host's pre-submit gate denied, by its batch index. */
type DeniedAction = { index: number; type: string; reason: string };

// Over RPC only the message survives; the host ends it with the indexes.
const DENIED_INDEXES = /; denied action indexes: \[(\d+(?:,\d+)*)\]$/;

function deniedActions(error: unknown): DeniedAction[] | undefined {
  const denied = (error as { denied?: unknown } | null)?.denied;
  if (Array.isArray(denied)) return denied as DeniedAction[];
  if (!(error instanceof Error) || error.name !== "ReactorAccessDeniedError") {
    return undefined;
  }
  const match = DENIED_INDEXES.exec(error.message);
  if (!match) return undefined;
  const reason = error.message.slice(0, match.index);
  return match[1].split(",").map((index) => ({
    index: Number(index),
    type: "",
    reason,
  }));
}

// A refused batch: the host's gate denied it, or admission failed the job.
function isDenial(error: unknown): boolean {
  if (deniedActions(error)) return true;
  if (!(error instanceof Error)) return false;
  const job = (error as { job?: { error?: { name?: string } } }).job;
  return (
    error.name === "AuthorizationDeniedError" ||
    (error.name === "JobFailedError" &&
      job?.error?.name === "AuthorizationDeniedError")
  );
}

const NO_OPERATION = "The reactor stored no operation for this action";

/** Executes built actions and returns the new revision; any action not applied throws. */
export async function executeBuiltActions(
  client: ReactorToolClient,
  document: PHDocument,
  actions: Action[],
  options: {
    branch?: string;
    signal?: AbortSignal;
    module?: DocumentModelModule;
  } = {},
): Promise<Revision> {
  const { branch = DEFAULT_BRANCH, signal, module } = options;
  let receipt: WriteReceipt;
  try {
    receipt = await readable(
      client.write.execute(document.header.id, branch, actions, signal),
    );
  } catch (error) {
    const denied = deniedActions(error);
    if (denied) {
      throw actionFailuresError(
        denied.map((d) => ({
          index: d.index,
          type: d.type || (actions.at(d.index)?.type ?? ""),
          code: "FORBIDDEN",
          errors: [d.reason],
        })),
        module,
      );
    }
    throw toReactorToolError(error);
  }
  const outcomes = await actionOutcomes(
    client,
    receipt,
    actions,
    document.header.revision,
    signal,
  );
  const failures = actions.flatMap((action, index): ActionFailure[] => {
    const outcome = outcomes.get(action.id);
    if (outcome?.kind === "applied") return [];
    return [
      {
        index,
        type: action.type,
        code: outcome?.kind === "denied" ? "FORBIDDEN" : "REDUCER_ERROR",
        errors: [
          !outcome
            ? NO_OPERATION
            : outcome.kind === "denied"
              ? outcome.reason
              : outcome.message,
        ],
      },
    ];
  });
  if (failures.length > 0) throw actionFailuresError(failures, module);
  return revisionAfter(client, receipt, signal);
}

export type ExecuteActionsOptions = ValidateActionsOptions & {
  branch?: string;
  signal?: AbortSignal;
};

/** The model module at the document's own version. */
export async function getDocumentModelForDocument(
  client: ReactorToolReadClient,
  document: PHDocument,
  signal?: AbortSignal,
): Promise<DocumentModelModule> {
  try {
    return await client.getDocumentModelModuleForDocument(document);
  } catch (error) {
    // An unknown type fails here with did-you-mean; a missing version below.
    await getDocumentModel(client, document.header.documentType, signal);
    throw toReactorToolError(error, "NOT_FOUND");
  }
}

export type ActionError = {
  /** reducer-error: the reducer threw; denied: a policy refused it; not-applied: nothing stored it. */
  kind: "reducer-error" | "denied" | "not-applied";
  message: string;
  /** The model's error class, for a reducer error. */
  name?: string;
  /** The model's error code, for a reducer error. */
  code?: string;
};

export type ActionResult = {
  index: number;
  type: string;
  scope: string;
  operationIndex?: number;
  error?: ActionError;
};

export type ExecutedActions = {
  documentId: string;
  revision: Revision;
  /** False when any result has an error. */
  success: boolean;
  results: ActionResult[];
};

type ModelError = { name: string; code: string };

/** Finds the declared error a reducer error was, by code, class name, then default message. */
function modelErrorFinder(
  module: DocumentModelModule,
  actionType: string,
): (name?: string, code?: string, message?: string) => ModelError | undefined {
  const operations = (
    module.documentModel.global.specifications.at(-1)?.modules ?? []
  ).flatMap((m) => m.operations);
  const declared = (errors: { name: string | null; code: string | null }[]) =>
    errors.flatMap(({ name, code }) => {
      if (!name) return [];
      const className = pascalCase(name);
      return [{ name: className, code: code?.trim() || className }];
    });
  // The action's own operation first, as two operations may share an error name.
  const candidates = [
    ...declared(operations.find((o) => o.name === actionType)?.errors ?? []),
    ...declared(operations.flatMap((o) => o.errors)),
  ];
  return (name, code, message) =>
    candidates.find((e) => code !== undefined && e.code === code) ??
    candidates.find((e) => name !== undefined && e.name === name) ??
    candidates.find((e) => e.name === message);
}

function outcomeError(
  outcome: StoredOutcome | undefined,
  module: DocumentModelModule,
  actionType: string,
): ActionError | undefined {
  if (!outcome) return { kind: "not-applied", message: NO_OPERATION };
  if (outcome.kind === "applied") return undefined;
  if (outcome.kind === "denied") {
    return { kind: "denied", message: outcome.reason };
  }
  const known = modelErrorFinder(module, actionType)(
    outcome.name,
    outcome.code,
    outcome.message,
  );
  const name = known?.name ?? outcome.name;
  const code = known?.code ?? outcome.code;
  return {
    kind: "reducer-error",
    message: outcome.message,
    ...(name !== undefined && { name }),
    ...(code !== undefined && { code }),
  };
}

type EvaluateActions = (
  documentIdentifier: string,
  branch: string,
  candidates: { scope: string; type: string; input: unknown }[],
  subject?: AuthSubject,
  signal?: AbortSignal,
) => Promise<{ evaluations: { decision: string; reason?: string }[] }>;

type EvaluatingClient = {
  evaluateActions?: EvaluateActions;
  write: { evaluateActions?: EvaluateActions };
};

// A policy refused the batch, so nothing in it was written.
async function refusedBatch(
  client: ReactorToolClient,
  documentId: string,
  branch: string,
  actions: readonly Action[],
  error: unknown,
  signal?: AbortSignal,
): Promise<ActionError[]> {
  const message = error instanceof Error ? error.message : String(error);
  const notApplied: ActionError = {
    kind: "not-applied",
    message: `The batch was refused, so nothing in it was written: ${message}`,
  };
  const denied = deniedActions(error);
  if (denied) {
    return actions.map((_, i): ActionError => {
      const denial = denied.find((d) => d.index === i);
      return denial ? { kind: "denied", message: denial.reason } : notApplied;
    });
  }
  // Clients that can evaluate the batch name the denied actions. No subject:
  // the write was judged as the client's signer.
  const evaluating = client as unknown as EvaluatingClient;
  const target = evaluating.write.evaluateActions
    ? evaluating.write
    : evaluating;
  const evaluate = target.evaluateActions;
  if (typeof evaluate !== "function") return actions.map(() => notApplied);
  try {
    const { evaluations } = await evaluate.call(
      target,
      documentId,
      branch,
      actions.map(({ scope, type, input }) => ({ scope, type, input })),
      undefined,
      signal,
    );
    return actions.map((_, i): ActionError => {
      const evaluation = evaluations.at(i);
      return evaluation?.decision === "deny"
        ? { kind: "denied", message: evaluation.reason ?? message }
        : notApplied;
    });
  } catch {
    return actions.map(() => notApplied);
  }
}

/** Validates every action, then executes them as one batch and reports each action's outcome. */
export async function executeActions(
  client: ReactorToolClient,
  documentId: string,
  inputs: readonly ActionInput[],
  options: ExecuteActionsOptions = {},
): Promise<ExecutedActions> {
  const { signal, branch = DEFAULT_BRANCH } = options;
  const document = await getDocument(client, documentId, signal, { branch });
  const id = document.header.id;
  const module = await getDocumentModelForDocument(client, document, signal);
  const { actions, failures } = validateActions(module, inputs, options);
  if (failures.length > 0) throw actionFailuresError(failures, module);
  const before = { ...document.header.revision };
  if (actions.length === 0) {
    return { documentId: id, revision: before, success: true, results: [] };
  }
  const result = (action: Action, index: number): ActionResult => ({
    index,
    type: action.type,
    scope: action.scope,
  });
  let receipt: WriteReceipt;
  try {
    receipt = await readable(client.write.execute(id, branch, actions, signal));
  } catch (error) {
    if (!isDenial(error)) throw toReactorToolError(error);
    const errors = await refusedBatch(
      client,
      id,
      branch,
      actions,
      error,
      signal,
    );
    return {
      documentId: id,
      revision: before,
      success: false,
      results: actions.map((a, i) => ({ ...result(a, i), error: errors[i] })),
    };
  }
  const outcomes = await actionOutcomes(
    client,
    receipt,
    actions,
    before,
    signal,
  );
  const results = actions.map((action, index): ActionResult => {
    const outcome = outcomes.get(action.id);
    const error = outcomeError(outcome, module, action.type);
    return {
      ...result(action, index),
      ...(outcome && { operationIndex: outcome.operationIndex }),
      ...(error && { error }),
    };
  });
  return {
    documentId: id,
    revision: await revisionAfter(client, receipt, signal),
    success: results.every((r) => !r.error),
    results,
  };
}

const ROLLBACK_TIMEOUT_MS = 10_000;

export type CreateDocumentInput = {
  documentType: string;
  name?: string;
  /** Drive id or slug; the document becomes its child and a drive file. */
  driveId?: string;
  parentFolder?: string;
};

export type CreatedDocument = {
  documentId: string;
  documentType: string;
  name: string;
  driveId?: string;
  revision: Revision;
};

// The reducer error of the drive's ADD_FILE for the document, if it stored one.
async function addFileError(
  client: ReactorToolReadClient,
  drive: PHDocument,
  documentId: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  const page = await client
    .getOperations(
      drive.header.id,
      { scopes: ["global"] },
      {
        sinceRevision:
          (drive.header.revision.global as number | undefined) ?? 0,
      },
      undefined,
      signal,
    )
    .catch(() => undefined);
  const operation = page?.results.find(
    (op) =>
      op.action.type === "ADD_FILE" &&
      (op.action.input as { id?: unknown }).id === documentId,
  );
  const outcome = operation && operationOutcome(operation);
  if (outcome?.kind === "reducer-error") return outcome.message;
  if (outcome?.kind === "denied") return outcome.reason;
  return undefined;
}

/** Creates the document, filed into the drive when given; a half-done filing is rolled back. */
export async function createDocument(
  client: ReactorToolClient,
  input: CreateDocumentInput,
  signal?: AbortSignal,
): Promise<CreatedDocument> {
  const module = await getDocumentModel(client, input.documentType, signal);
  const drive = input.driveId
    ? await getDocument(client, input.driveId, signal)
    : undefined;
  if (drive && !DRIVE_DOCUMENT_TYPES.has(drive.header.documentType)) {
    throw new ReactorToolError(
      "INVALID_ACTION",
      `driveId ${input.driveId} names a ${drive.header.documentType}, not a drive`,
    );
  }
  if (input.parentFolder && !drive) {
    throw new ReactorToolError(
      "INVALID_ACTION",
      "parentFolder needs driveId to name a drive",
    );
  }
  const documentType = module.documentModel.global.id;
  const name = input.name ?? "";
  let document: PHDocument;
  try {
    document = await client.newDocument(
      documentType,
      {
        ...(drive && { parentIdentifier: drive.header.id }),
        ...(name && { name }),
      },
      signal,
    );
  } catch (error) {
    throw toReactorToolError(error);
  }
  const documentId = document.header.id;
  // addFile creates the document before filing it; a later failure deletes
  // it and its node, under its own timeout as the caller's signal may be spent.
  const rollback = async (error: unknown) => {
    const e = toReactorToolError(error);
    try {
      await deleteDocument(
        client,
        documentId,
        AbortSignal.timeout(ROLLBACK_TIMEOUT_MS),
      );
    } catch (deleteError) {
      if (toReactorToolError(deleteError).code !== "NOT_FOUND") {
        return new ReactorToolError(
          e.code,
          `Document ${documentId} was created but could not be removed after: ${e.message}`,
          { failures: e.failures, cause: error },
        );
      }
    }
    return new ReactorToolError(e.code, e.message, {
      failures: e.failures,
      cause: error,
    });
  };
  let receipt: WriteReceipt;
  if (!drive) {
    try {
      receipt = await readable(
        client.write.create(document, undefined, signal),
      );
    } catch (error) {
      throw toReactorToolError(error);
    }
  } else {
    try {
      receipt = await readable(
        client.write.drives.addFile(
          drive.header.id,
          document,
          input.parentFolder,
          signal,
        ),
      );
    } catch (error) {
      throw await rollback(error);
    }
    // A document drive's reducer may reject the ADD_FILE without failing the job.
    if (drive.header.documentType === DRIVE_DOCUMENT_TYPE) {
      const filed = await getDocument(client, drive.header.id, signal, {
        token: receipt.token,
      }).catch(() => undefined);
      const nodes = (
        filed?.state as { global?: { nodes?: { id: string }[] } } | undefined
      )?.global?.nodes;
      if (nodes && !nodes.some((node) => node.id === documentId)) {
        const reason =
          (await addFileError(client, drive, documentId, signal)) ??
          "the drive stored no node for it";
        throw await rollback(
          new ReactorToolError(
            "REDUCER_ERROR",
            `Drive ${drive.header.id} did not file the document: ${reason}`,
          ),
        );
      }
    }
  }
  const created = await getDocument(client, documentId, signal, {
    token: receipt.token,
  });
  return {
    documentId,
    documentType,
    name,
    ...(drive ? { driveId: drive.header.id } : {}),
    revision: { ...created.header.revision },
  };
}

type DriveNodes = { global?: { nodes?: unknown } };

type AuthorizingWriteClient = {
  authorizeDelete?: (id: string, signal?: AbortSignal) => Promise<void>;
};

/** Removes the document's node from each document drive filing it, then deletes it. */
export async function deleteDocument(
  client: ReactorToolClient,
  documentId: string,
  signal?: AbortSignal,
): Promise<{ documentId: string }> {
  const document = await getDocument(client, documentId, signal);
  const id = document.header.id;
  // A host ACL in front of the client refuses before any drive changes.
  const { authorizeDelete } = client.write as AuthorizingWriteClient;
  await authorizeDelete?.call(client.write, id, signal);
  const parents = await client
    .getIncomingRelationships(id, "child", undefined, undefined, signal)
    .catch((error: unknown) => {
      throw toReactorToolError(error);
    });
  // Another drive type's node is the relationship the delete removes.
  const filing: PHDocument[] = [];
  for (const parent of parents.results) {
    if (parent.header.documentType !== DRIVE_DOCUMENT_TYPE) continue;
    const nodes = (parent.state as DriveNodes).global?.nodes;
    if (!Array.isArray(nodes)) {
      throw new ReactorToolError(
        "FORBIDDEN",
        `Document ${id} is filed in drive ${parent.header.id}, whose nodes you cannot read; it was not deleted`,
      );
    }
    if (nodes.some((node) => (node as { id?: unknown }).id === id)) {
      filing.push(parent);
    }
  }
  for (const parent of filing) {
    await executeBuiltActions(client, parent, [deleteNode({ id })], { signal });
  }
  try {
    await readable(client.write.deleteDocument(id, undefined, signal));
  } catch (error) {
    throw toReactorToolError(error);
  }
  return { documentId: id };
}
