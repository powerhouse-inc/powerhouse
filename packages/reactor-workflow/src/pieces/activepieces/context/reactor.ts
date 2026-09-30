// `ctx.reactor` — the one way piece code reaches the reactor it runs inside.

// Pieces are isolated from the host on purpose, so this is not a client: it is
// the same call channel `ctx.store` uses (doc 08 §10), and every method is a
// round trip the host answers. The host installs it only for a piece that came
// from an installed reactor package; a bundle fetched from a registry gets the
// throwing stub instead, and finds out by name that it has no reactor.
import { callHost } from "../worker/host-call.js";
import type {
  ReactorCreateInput,
  ReactorDocumentSummary,
  ReactorExecuteInput,
  ReactorFindInput,
  ReactorModelDetail,
  ReactorModelSummary,
  ReactorService,
} from "@powerhousedao/pieces-framework";
import {
  REACTOR_CREATE,
  REACTOR_EXECUTE,
  REACTOR_FIND,
  REACTOR_GET,
  REACTOR_MODEL,
  REACTOR_MODELS,
} from "../worker/protocol.js";

// The service contract and its input/output shapes live in the framework, so a
// piece and the host it calls are typed against one declaration.
export type {
  ReactorActionInput,
  ReactorCreateInput,
  ReactorDocumentSummary,
  ReactorExecuteInput,
  ReactorFindInput,
  ReactorModelActionSchema,
  ReactorModelDetail,
  ReactorModelSummary,
  ReactorService,
} from "@powerhousedao/pieces-framework";

// `actionIds` are in the order the actions were given.
export interface ReactorSubmission {
  jobId: string;
  actionIds: string[];
}

export interface ReactorWaitInput {
  jobId: string;
  maxWaitMs: number;
}

// UNKNOWN: no record of the job (a restart); its actions may or may not be written.
export type ReactorJobStatus =
  | "PENDING"
  | "RUNNING"
  | "WRITE_READY"
  | "READ_READY"
  | "FAILED"
  | "UNKNOWN";

export interface ReactorActionOutcome {
  actionId: string;
  kind: "applied" | "reducer-error" | "denied";
  message?: string;
  reason?: string;
}

// `actions` appears once the job's operations are written.
export interface ReactorJobState {
  jobId: string;
  status: ReactorJobStatus;
  error?: string;
  actions?: ReactorActionOutcome[];
}

// The worker's half: every method is one host call, named so a failure reads
// as the operation the piece asked for.
export class RemoteReactorService implements ReactorService {
  models(): Promise<ReactorModelSummary[]> {
    return callHost<ReactorModelSummary[]>(REACTOR_MODELS, {});
  }

  model(documentType: string): Promise<ReactorModelDetail> {
    return callHost<ReactorModelDetail>(REACTOR_MODEL, { documentType });
  }

  get(input: {
    documentId: string;
    branch?: string;
  }): Promise<ReactorDocumentSummary> {
    return callHost<ReactorDocumentSummary>(REACTOR_GET, input);
  }

  find(input: ReactorFindInput): Promise<ReactorDocumentSummary[]> {
    return callHost<ReactorDocumentSummary[]>(REACTOR_FIND, input);
  }

  create(input: ReactorCreateInput): Promise<ReactorDocumentSummary> {
    return callHost<ReactorDocumentSummary>(REACTOR_CREATE, input);
  }

  execute(input: ReactorExecuteInput): Promise<ReactorDocumentSummary> {
    return callHost<ReactorDocumentSummary>(REACTOR_EXECUTE, input);
  }
}
