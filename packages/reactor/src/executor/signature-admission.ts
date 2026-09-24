import type {
  Action,
  ActionSigner,
  CreateDocumentActionInput,
  ISigner,
  Operation,
  SignaturePolicy,
} from "@powerhousedao/shared/document-model";
import {
  actionSigningTarget,
  canonicalJson,
  deriveOperationId,
  signaturePolicyOf,
} from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import type { IEventBus } from "../events/interfaces.js";
import {
  ReactorEventTypes,
  type SignatureRefusedEvent,
} from "../events/types.js";
import type { IDocumentMetaCache } from "../cache/document-meta-cache-types.js";
import type { IWriteCache } from "../cache/write/interfaces.js";
import type { Job } from "../queue/types.js";
import {
  DocumentNotFoundError,
  InvalidSignatureError,
} from "../shared/errors.js";
import { PassthroughSigner } from "../signer/passthrough-signer.js";
import { admissionTrustPolicy } from "../signer/trust-policy.js";
import type {
  AdmissionPath,
  SignatureTrustPolicy,
  SignatureVerdict,
  SignatureVerificationMode,
} from "../signer/types.js";
import { verifyActionSignature } from "../signer/verify-action-signature.js";
import {
  SYNTHESIZING_TYPES,
  synthesizedActionId,
} from "./synthesized-signing.js";
import type { IOperationStore } from "../storage/interfaces.js";

type Stream = { documentId: string; scope: string; branch: string };

type Candidate = {
  action: Action;
  stream: Stream;
  opId: string;
  /** The operation the reducer stores in place of a submitted UNDO or REDO. */
  synthesizedOpId?: string;
  operation?: Operation;
  policy?: SignaturePolicy;
};

/** What admission reads: the stream for live ids, a cache for the policy. */
export type AdmissionStores = {
  operationStore: IOperationStore;
  documentMetaCache: IDocumentMetaCache;
  writeCache: IWriteCache;
};

/**
 * Where a stored document's policy is read: the write cache when the decision
 * model reads the document scope from there anyway, else the meta cache.
 */
export type PolicySource = "meta" | "write-cache";

type Refusal = Extract<SignatureVerdict, { ok: false }>;

/** Who may sign as whom: see {@link SignatureTrustPolicy}. */
export type AdmissionTrust = {
  /** The reactor's own signer, whose key is accepted for its own user. */
  signer?: ISigner;
  /** Selects the default when there is no `policy`. */
  authEnforcement: boolean;
  policy?: SignatureTrustPolicy;
  /** A policy slower than this fails the job, to be retried. */
  timeoutMs: number;
};

export const DEFAULT_TRUST_TIMEOUT_MS = 10_000;

/**
 * `committed`: the job is a retry whose every write is already stored exactly
 * as submitted, so its first attempt committed and nothing is written again.
 */
export type MutationAdmission =
  | { kind: "admitted" }
  | { kind: "refused"; error: InvalidSignatureError }
  | { kind: "committed" };

/** Runs once per write, when this reactor first stores it; never on re-appends. */
export class SignatureAdmission {
  private readonly trustPolicy: SignatureTrustPolicy;
  private readonly trustTimeoutMs: number;

  constructor(
    private readonly mode: SignatureVerificationMode,
    private readonly logger: ILogger,
    private readonly eventBus: IEventBus,
    private readonly policySource: PolicySource = "meta",
    trust: AdmissionTrust = {
      authEnforcement: false,
      timeoutMs: DEFAULT_TRUST_TIMEOUT_MS,
    },
  ) {
    this.trustPolicy = admissionTrustPolicy(
      trust.signer ?? new PassthroughSigner(),
      trust.authEnforcement,
      trust.policy,
    );
    this.trustTimeoutMs = trust.timeoutMs;
  }

  /** The first refusal of a mutation's submitted actions, when enforcing. */
  async admitMutation(
    job: Job,
    stores: AdmissionStores,
    signal?: AbortSignal,
  ): Promise<MutationAdmission> {
    const { operationStore } = stores;
    const candidates = job.actions.map((action) =>
      candidate(action, mutationStream(action, job)),
    );
    const live = await this.liveOperationIds(
      candidates,
      operationStore,
      signal,
    );

    // A job the queue retried may have committed before its first attempt was
    // lost (a worker exiting, an abort timing out). Its writes then sit in the
    // stream unchanged, and refusing them as duplicates would fail a write that
    // landed.
    if (
      isRetry(job) &&
      candidates.length > 0 &&
      candidates.every((entry) => isLive(entry, live)) &&
      (await this.storedAsSubmitted(candidates, live, operationStore, signal))
    ) {
      return { kind: "committed" };
    }

    await resolvePolicies(candidates, job.actions, (documentId, branch) =>
      storedPolicy(stores, this.policySource, documentId, branch, signal),
    );
    const submitted = new Set<string>();
    for (const entry of candidates) {
      const verdict = await this.verdict(
        entry,
        live,
        submitted,
        "mutation",
        signal,
      );
      submitted.add(entry.opId);
      if (verdict.ok) {
        continue;
      }
      const refusal = this.record(job, entry, verdict, "mutation");
      if (refusal) {
        return { kind: "refused", error: refusal };
      }
    }
    return { kind: "admitted" };
  }

  /** The incoming operations a load drops, empty unless enforcing. */
  async admitLoad(
    job: Job,
    operations: Operation[],
    stores: AdmissionStores,
    signal?: AbortSignal,
  ): Promise<Set<Operation>> {
    const { operationStore } = stores;
    const stream = {
      documentId: job.documentId,
      scope: job.scope,
      branch: job.branch,
    };
    const candidates = operations.map((operation) => ({
      ...candidate(operation.action, stream),
      operation,
    }));
    const live = await this.liveOperationIds(
      candidates,
      operationStore,
      signal,
    );

    await resolvePolicies(
      candidates,
      job.operations.map((operation) => operation.action),
      (documentId, branch) =>
        storedPolicy(stores, this.policySource, documentId, branch, signal),
    );
    const dropped = new Set<Operation>();
    for (let i = 0; i < candidates.length; i++) {
      const verdict = await this.verdict(
        candidates[i],
        live,
        undefined,
        "load",
        signal,
      );
      if (verdict.ok) {
        continue;
      }
      if (this.record(job, candidates[i], verdict, "load")) {
        dropped.add(operations[i]);
      }
    }
    return dropped;
  }

  private async verdict(
    entry: Candidate,
    live: Set<string>,
    submitted: Set<string> | undefined,
    path: AdmissionPath,
    signal?: AbortSignal,
  ): Promise<SignatureVerdict> {
    const verdict = await verifyActionSignature(
      entry.action,
      {
        documentId: entry.stream.documentId,
        branch: entry.stream.branch,
        policy: entry.policy,
      },
      path,
      entry.operation,
    );
    if (!verdict.ok) {
      return verdict;
    }
    if (isLive(entry, live) || submitted?.has(entry.opId)) {
      return {
        ok: false,
        scheme: verdict.scheme,
        code: "DUPLICATE_ACTION",
        reason: `action ${entry.action.id} is already in the stream`,
      };
    }
    if (verdict.scheme === "unsigned") {
      return verdict;
    }

    const signer = entry.action.context!.signer!;
    const authorized = await this.authorize(
      signer,
      entry.stream.documentId,
      signal,
    );
    if (!authorized) {
      return {
        ok: false,
        scheme: verdict.scheme,
        code: "SIGNER_UNAUTHORIZED",
        reason: `action ${entry.action.id}: key ${signer.app.key} may not sign as ${signer.user.address}`,
      };
    }
    return verdict;
  }

  /** Throws when the policy does, times out or the job is aborted. */
  private async authorize(
    signer: ActionSigner,
    documentId: string,
    signal?: AbortSignal,
  ): Promise<boolean> {
    signal?.throwIfAborted();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    const stop = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(
          new Error(
            `signature trust policy did not answer for ${signer.app.key} within ${this.trustTimeoutMs}ms`,
          ),
        );
      }, this.trustTimeoutMs);
      if (signal) {
        onAbort = () =>
          reject(
            signal.reason instanceof Error
              ? signal.reason
              : new Error(String(signal.reason)),
          );
        signal.addEventListener("abort", onAbort, { once: true });
      }
    });
    try {
      return await Promise.race([
        this.trustPolicy.authorizeSigner(signer, signer.app.key, documentId),
        stop,
      ]);
    } finally {
      clearTimeout(timer);
      if (onAbort) {
        signal?.removeEventListener("abort", onAbort);
      }
    }
  }

  private async storedAsSubmitted(
    candidates: Candidate[],
    live: Set<string>,
    operationStore: IOperationStore,
    signal?: AbortSignal,
  ): Promise<boolean> {
    // A synthesized operation holds another action; that it is stored is enough.
    const asSubmitted = candidates.filter(
      (entry) => !entry.synthesizedOpId || !live.has(entry.synthesizedOpId),
    );
    for (const [stream, entries] of byStream(asSubmitted)) {
      const stored = await operationStore.getOperationsByIds(
        stream.documentId,
        stream.scope,
        stream.branch,
        entries.map((entry) => entry.opId),
        signal,
      );
      const byId = new Map(
        stored.map((operation) => [operation.id, operation]),
      );
      for (const entry of entries) {
        const operation = byId.get(entry.opId);
        if (!operation || !sameContent(operation.action, entry.action)) {
          return false;
        }
      }
    }
    return true;
  }

  private async liveOperationIds(
    candidates: Candidate[],
    operationStore: IOperationStore,
    signal?: AbortSignal,
  ): Promise<Set<string>> {
    const live = new Set<string>();
    for (const [stream, entries] of byStream(candidates)) {
      const found = await operationStore.findOperationIds(
        stream.documentId,
        stream.scope,
        stream.branch,
        entries.flatMap((entry) =>
          entry.synthesizedOpId
            ? [entry.opId, entry.synthesizedOpId]
            : [entry.opId],
        ),
        signal,
      );
      for (const opId of found) {
        live.add(opId);
      }
    }
    return live;
  }

  /** Logs and counts a refusal; returns the error only when enforcing. */
  private record(
    job: Job,
    entry: Candidate,
    refusal: Refusal,
    path: AdmissionPath,
  ): InvalidSignatureError | undefined {
    const enforced = this.mode === "enforce";
    const event: SignatureRefusedEvent = {
      jobId: job.id,
      documentId: entry.stream.documentId,
      scope: entry.stream.scope,
      branch: entry.stream.branch,
      actionId: entry.action.id,
      code: refusal.code,
      scheme: refusal.scheme,
      path,
      enforced,
      reason: refusal.reason,
    };

    this.logger.warn(
      enforced
        ? "Signature refused: @Refusal"
        : "Signature refusal logged, write admitted: @Refusal",
      event,
    );
    this.eventBus
      .emit(ReactorEventTypes.SIGNATURE_REFUSED, event)
      .catch((error) => {
        this.logger.error("Failed to emit SIGNATURE_REFUSED: @Error", error);
      });

    return enforced
      ? new InvalidSignatureError(
          entry.stream.documentId,
          refusal.code,
          refusal.reason,
        )
      : undefined;
  }
}

/**
 * A CREATE_DOCUMENT is verified under its own input. Anything else takes the
 * stored document's policy, or, for a document this job creates, that CREATE's.
 */
async function resolvePolicies(
  candidates: Candidate[],
  jobActions: Action[],
  stored: (
    documentId: string,
    branch: string,
  ) => Promise<SignaturePolicy | undefined>,
): Promise<void> {
  const resolved = new Map<string, SignaturePolicy>();
  for (const entry of candidates) {
    if (entry.action.type === "CREATE_DOCUMENT") {
      entry.policy = createPolicy(entry.action);
      continue;
    }

    const { documentId, branch } = entry.stream;
    const key = `${documentId}\u0000${branch}`;
    let policy = resolved.get(key);
    if (policy === undefined) {
      policy =
        (await stored(documentId, branch)) ??
        createdPolicy(jobActions, documentId) ??
        "legacy";
      resolved.set(key, policy);
    }
    entry.policy = policy;
  }
}

async function storedPolicy(
  stores: AdmissionStores,
  source: PolicySource,
  documentId: string,
  branch: string,
  signal?: AbortSignal,
): Promise<SignaturePolicy | undefined> {
  try {
    if (source === "write-cache") {
      const document = await stores.writeCache.getState(
        documentId,
        "document",
        branch,
        undefined,
        signal,
      );
      return signaturePolicyOf(document.header);
    }
    const meta = await stores.documentMetaCache.getDocumentMeta(
      documentId,
      branch,
      signal,
    );
    return signaturePolicyOf(meta.protocolVersions);
  } catch (error) {
    if (DocumentNotFoundError.isError(error)) {
      return undefined;
    }
    throw error;
  }
}

function createdPolicy(
  actions: Action[],
  documentId: string,
): SignaturePolicy | undefined {
  const create = actions.find(
    (action) =>
      action.type === "CREATE_DOCUMENT" &&
      (action.input as CreateDocumentActionInput | undefined)?.documentId ===
        documentId,
  );
  return create ? createPolicy(create) : undefined;
}

function createPolicy(action: Action): SignaturePolicy {
  return signaturePolicyOf(action.input as CreateDocumentActionInput);
}

function candidate(action: Action, stream: Stream): Candidate {
  const opId = (actionId: string) =>
    deriveOperationId(stream.documentId, stream.scope, stream.branch, actionId);
  return {
    action,
    stream,
    opId: opId(action.id),
    synthesizedOpId: SYNTHESIZING_TYPES.has(action.type)
      ? opId(synthesizedActionId(action.id))
      : undefined,
  };
}

function isLive(entry: Candidate, live: Set<string>): boolean {
  return (
    live.has(entry.opId) ||
    (entry.synthesizedOpId !== undefined && live.has(entry.synthesizedOpId))
  );
}

function mutationStream(action: Action, job: Job): Stream {
  return {
    ...actionSigningTarget(action, job.documentId, job.branch),
    scope: job.scope,
  };
}

function byStream(candidates: Candidate[]): [Stream, Candidate[]][] {
  const groups = new Map<string, [Stream, Candidate[]]>();
  for (const entry of candidates) {
    const key = `${entry.stream.documentId}\u0000${entry.stream.scope}\u0000${entry.stream.branch}`;
    const group = groups.get(key) ?? [entry.stream, []];
    group[1].push(entry);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function isRetry(job: Job): boolean {
  return job.errorHistory.length > 0 || (job.retryCount ?? 0) > 0;
}

function sameContent(stored: Action, submitted: Action): boolean {
  try {
    return canonicalJson(stored) === canonicalJson(submitted);
  } catch {
    return false;
  }
}
