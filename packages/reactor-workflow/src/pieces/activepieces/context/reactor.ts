// `ctx.reactor` — the one way piece code reaches the reactor it runs inside.

// Pieces are isolated from the host on purpose, so this is not a client: it is
// the same call channel `ctx.store` uses (doc 08 §10), and every method is a
// round trip the host answers. The host installs it only for a piece that came
// from an installed reactor package; a bundle fetched from a registry gets the
// throwing stub instead, and finds out by name that it has no reactor.
import { callHost } from "../worker/host-call.js";
import {
  REACTOR_CREATE,
  REACTOR_EXECUTE,
  REACTOR_FIND,
  REACTOR_GET,
  REACTOR_MODEL,
  REACTOR_MODELS,
} from "../worker/protocol.js";

// A document as it crosses the boundary: never the PHDocument itself, whose
// operations and signatures are neither serializable nor a piece's business.
export interface ReactorDocumentSummary {
  documentId: string;
  documentType: string;
  name: string;
  slug?: string;
  // Global state; present on reads of one document, absent from listings.
  state?: unknown;
}

// One action to dispatch. `scope` defaults to "global" at the host.
export interface ReactorActionInput {
  type: string;
  input?: unknown;
  scope?: string;
}

export interface ReactorModelSummary {
  documentType: string;
  name: string;
}

export interface ReactorModelActionSchema {
  type: string;
  module: string;
  inputSchema: string | null;
}

export interface ReactorModelDetail extends ReactorModelSummary {
  stateSchema: string | null;
  actions: ReactorModelActionSchema[];
}

export interface ReactorFindInput {
  documentType?: string;
  parentId?: string;
  // Host-side cap on what the index returns; the caller still filters and slices.
  limit?: number;
  // Keep only documents whose global state holds `value` at `path` (dotted,
  // e.g. "orderId" or "settlement.status"). The index cannot query state, so
  // the host reads a page and matches within it — see the host handler.
  match?: { path: string; value: string };
  // Return each document's global state alongside its summary. Off by default:
  // a find over a page of documents would otherwise carry every one of their
  // states across the worker boundary.
  withState?: boolean;
}

export interface ReactorCreateInput {
  documentType: string;
  name?: string;
  // A drive or a folder node in one: the host resolves which, and files the
  // document into that drive so it is visible there rather than only related.
  parentId?: string;
}

export interface ReactorExecuteInput {
  documentId: string;
  branch?: string;
  actions: ReactorActionInput[];
}

// What a piece may ask of the reactor. Deliberately document-shaped rather
// than a mirror of IReactorClient: the host owns drive resolution, model
// modules and operation-error checking, none of which survive serialization.
export interface ReactorService {
  models(): Promise<ReactorModelSummary[]>;
  model(documentType: string): Promise<ReactorModelDetail>;
  get(input: { documentId: string; branch?: string }): Promise<ReactorDocumentSummary>;
  find(input: ReactorFindInput): Promise<ReactorDocumentSummary[]>;
  create(input: ReactorCreateInput): Promise<ReactorDocumentSummary>;
  execute(input: ReactorExecuteInput): Promise<ReactorDocumentSummary>;
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
