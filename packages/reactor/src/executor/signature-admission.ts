import type { Action, Operation } from "@powerhousedao/shared/document-model";
import {
  actionSigningTarget,
  deriveOperationId,
} from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import type { IEventBus } from "../events/interfaces.js";
import {
  ReactorEventTypes,
  type SignatureRefusedEvent,
} from "../events/types.js";
import type { Job } from "../queue/types.js";
import { InvalidSignatureError } from "../shared/errors.js";
import type {
  AdmissionPath,
  SignatureVerdict,
  SignatureVerificationMode,
} from "../signer/types.js";
import { verifyActionSignature } from "../signer/verify-action-signature.js";
import type { IOperationStore } from "../storage/interfaces.js";

type Stream = { documentId: string; scope: string; branch: string };

type Candidate = {
  action: Action;
  stream: Stream;
  opId: string;
  operation?: Operation;
};

type Refusal = Extract<SignatureVerdict, { ok: false }>;

/** Runs once per write, when this reactor first stores it; never on re-appends. */
export class SignatureAdmission {
  constructor(
    private readonly mode: SignatureVerificationMode,
    private readonly logger: ILogger,
    private readonly eventBus: IEventBus,
  ) {}

  /** The first refusal of a mutation's submitted actions, when enforcing. */
  async admitMutation(
    job: Job,
    operationStore: IOperationStore,
    signal?: AbortSignal,
  ): Promise<InvalidSignatureError | undefined> {
    const candidates = job.actions.map((action) =>
      candidate(action, mutationStream(action, job)),
    );
    const live = await this.liveOperationIds(
      candidates,
      operationStore,
      signal,
    );

    const submitted = new Set<string>();
    for (const entry of candidates) {
      const verdict = await this.verdict(entry, live, submitted, "mutation");
      submitted.add(entry.opId);
      if (verdict.ok) {
        continue;
      }
      const refusal = this.record(job, entry, verdict, "mutation");
      if (refusal) {
        return refusal;
      }
    }
    return undefined;
  }

  /** The incoming operations a load drops, empty unless enforcing. */
  async admitLoad(
    job: Job,
    operations: Operation[],
    operationStore: IOperationStore,
    signal?: AbortSignal,
  ): Promise<Set<Operation>> {
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

    const dropped = new Set<Operation>();
    for (let i = 0; i < candidates.length; i++) {
      const verdict = await this.verdict(
        candidates[i],
        live,
        undefined,
        "load",
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
  ): Promise<SignatureVerdict> {
    const verdict = await verifyActionSignature(
      entry.action,
      { documentId: entry.stream.documentId, branch: entry.stream.branch },
      path,
      entry.operation,
    );
    if (!verdict.ok) {
      return verdict;
    }
    if (live.has(entry.opId) || submitted?.has(entry.opId)) {
      return {
        ok: false,
        scheme: verdict.scheme,
        code: "DUPLICATE_ACTION",
        reason: `action ${entry.action.id} is already in the stream`,
      };
    }
    return verdict;
  }

  private async liveOperationIds(
    candidates: Candidate[],
    operationStore: IOperationStore,
    signal?: AbortSignal,
  ): Promise<Set<string>> {
    const byStream = new Map<string, { stream: Stream; opIds: string[] }>();
    for (const entry of candidates) {
      const key = `${entry.stream.documentId}\u0000${entry.stream.scope}\u0000${entry.stream.branch}`;
      const group = byStream.get(key) ?? { stream: entry.stream, opIds: [] };
      group.opIds.push(entry.opId);
      byStream.set(key, group);
    }

    const live = new Set<string>();
    for (const { stream, opIds } of byStream.values()) {
      const found = await operationStore.findOperationIds(
        stream.documentId,
        stream.scope,
        stream.branch,
        opIds,
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

function candidate(action: Action, stream: Stream): Candidate {
  return {
    action,
    stream,
    opId: deriveOperationId(
      stream.documentId,
      stream.scope,
      stream.branch,
      action.id,
    ),
  };
}

function mutationStream(action: Action, job: Job): Stream {
  return {
    ...actionSigningTarget(action, job.documentId, job.branch),
    scope: job.scope,
  };
}
