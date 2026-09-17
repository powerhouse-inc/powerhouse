// What a piece may ask of the reactor it runs inside. Document-shaped on
// purpose: the host owns drives, model modules and operation-error checks.

// A document as it crosses the boundary, never the PHDocument itself.
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
  // Keep only documents whose global state holds `value` at the dotted `path`.
  match?: { path: string; value: string };
  // Return each document's global state with its summary. Off by default.
  withState?: boolean;
}

export interface ReactorCreateInput {
  documentType: string;
  name?: string;
  // A drive or a folder node in one; the host files the document there.
  parentId?: string;
}

export interface ReactorExecuteInput {
  documentId: string;
  branch?: string;
  actions: ReactorActionInput[];
}

export interface ReactorService {
  models(): Promise<ReactorModelSummary[]>;
  model(documentType: string): Promise<ReactorModelDetail>;
  get(input: {
    documentId: string;
    branch?: string;
  }): Promise<ReactorDocumentSummary>;
  find(input: ReactorFindInput): Promise<ReactorDocumentSummary[]>;
  create(input: ReactorCreateInput): Promise<ReactorDocumentSummary>;
  execute(input: ReactorExecuteInput): Promise<ReactorDocumentSummary>;
}
