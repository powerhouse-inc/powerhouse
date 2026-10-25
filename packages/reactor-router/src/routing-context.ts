import {
  JOB_NOT_FOUND_ERROR_NAME,
  JobStatus,
  type JobInfo,
  type ViewFilter,
} from "@powerhousedao/reactor";
import type {
  DocumentModelModule,
  ISigner,
  Signature,
} from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import {
  UnsupportedByBackendError,
  type IRoutableBackend,
  type RouterBackend,
} from "./backend.js";
import type { RouteDispatcher } from "./dispatcher.js";
import type { RoutingOptions } from "./types.js";

/**
 * What the routing read and write halves share: one dispatcher (so one route
 * table, one dedup window and one ownership guard), the signer for the actions
 * the router builds itself, and the module registry when one was given.
 */
export type RoutingContext = {
  readonly dispatcher: RouteDispatcher;
  readonly signer: ISigner;
  readonly logger: ILogger;
  /** Absent, the primary backend's registry is asked. */
  readonly modules: (() => readonly DocumentModelModule[]) | undefined;
  readonly dedupSize: number;
  /** See {@link RoutingOptions.answerFailedIdCheck}. */
  readonly answerFailedIdCheck:
    | ((documentId: string, error: unknown) => boolean | undefined)
    | undefined;
};

/** Members a backend may leave out; calling one it left out is refused. */
export type OptionalMember =
  | "isDocumentIdTaken"
  | "resolveIdOrSlug"
  | "evaluateActions"
  | "loadBatch"
  | "addRelationship"
  | "updateRelationship"
  | "removeRelationship"
  | "moveRelationship"
  | "getDocumentModelModules"
  | "getDocumentModelModule";

export function declared<K extends OptionalMember>(
  backend: RouterBackend,
  member: K,
): NonNullable<IRoutableBackend[K]> {
  const value = backend.api[member];
  if (value === undefined) {
    throw new UnsupportedByBackendError(
      backend.name,
      member,
      "the backend does not declare it",
    );
  }
  return value.bind(backend.api) as NonNullable<IRoutableBackend[K]>;
}

/** Refuses a point-in-time read on a backend that does not declare them. */
export function assertView(
  backend: RouterBackend,
  view: ViewFilter | undefined,
  member: string,
): void {
  if (view?.revision === undefined || backend.api.supports.pointInTimeViews) {
    return;
  }
  throw new UnsupportedByBackendError(
    backend.name,
    member,
    "the backend does not serve point-in-time views",
  );
}

/** The reactor's answer for a job no backend knows. */
export function unknownJob(jobId: string): JobInfo {
  const now = new Date().toISOString();
  return {
    id: jobId,
    documentId: "",
    status: JobStatus.FAILED,
    createdAtUtcIso: now,
    completedAtUtcIso: now,
    error: {
      name: JOB_NOT_FOUND_ERROR_NAME,
      message: "Job not found",
      stack: "",
    },
    consistencyToken: { version: 1, createdAtUtcIso: now, coordinates: [] },
    meta: { batchId: jobId, batchJobIds: [jobId] },
  };
}

export class UnsignedSigner implements ISigner {
  publicKey = {} as CryptoKey;

  sign(): Promise<Uint8Array> {
    return Promise.resolve(new Uint8Array(0));
  }

  verify(): Promise<void> {
    return Promise.resolve();
  }

  signAction(): Promise<Signature> {
    return Promise.resolve(["", "", "", "", ""]);
  }
}
