// The host's half of `ctx.reactor`: the operations a package piece asks for,
// run against this reactor through the subgraph's client.

// Everything here is what could not cross the worker boundary — model modules
// and their factories, drive nodes, a PHDocument's operations — so the piece
// keeps the block's own semantics and the reactor stays on this side of it.
import type { WorkflowCaller, WorkflowRuntimeHostDeps } from "./host.js";
import type {
  ReactorCreateInput,
  ReactorDocumentSummary,
  ReactorExecuteInput,
  ReactorFindInput,
  ReactorModelDetail,
  ReactorModelSummary,
  ReactorPort,
} from "../pieces/index.js";
import { createAction, type Action, type PHDocument } from "document-model";

const DRIVE_DOCUMENT_TYPE = "powerhouse/document-drive";
const DRIVE_DOCUMENT_TYPES = new Set([
  DRIVE_DOCUMENT_TYPE,
  "powerhouse/reactor-drive",
]);

// The index rejects an empty filter, so a typeless sweep asks per type; this
// caps what each one contributes before the caller slices.
const FIND_PAGE_LIMIT = 100;

// Design time resolves options for an editor, never edits documents: a piece
// asking to write there is refused rather than authorized.
const DESIGN_TIME_WRITES_REFUSED =
  "Reactor writes are not available while resolving design-time options";

const DESIGN_TIME_CALLER_REQUIRED =
  "Design-time reactor access requires an authenticated request";

// Base actions every document type accepts, beyond its model's own.
const BASE_ACTIONS = [
  {
    type: "SET_NAME",
    module: "base",
    inputSchema: "input SetNameInput {\n  name: String!\n}",
  },
];

interface DriveTarget {
  driveId: string;
  parentFolder?: string;
}

// The value at a dotted path inside a document's global state. Anything that
// is not a plain object on the way down ends the walk: a path into a scalar is
// a mismatch, not an error, because the documents being filtered are of one
// type only by convention and the step cannot know every shape it will meet.
function stateValueAt(document: PHDocument, path: string): unknown {
  const globalState = (document.state as Record<string, unknown>).global;
  let current: unknown = globalState;
  for (const segment of path.split(".")) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

// Compared as strings, so a step whose value came from an expression matches a
// number in state: every expression resolves to text by the time it reaches
// here, and `"42" !== 42` would make the match silently impossible.
export function matchesState(
  document: PHDocument,
  match: { path: string; value: string } | undefined,
): boolean {
  if (!match) return true;
  const value = stateValueAt(document, match.path);
  if (typeof value === "string") return value === match.value;
  // Only the scalars a state field plausibly holds. A path landing on an
  // object, an array or nothing is a mismatch rather than an error — the
  // documents being filtered share a type only by convention, and the step
  // cannot know every shape it will meet.
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value) === match.value;
  }
  return false;
}

export function documentSummary(
  document: PHDocument,
  withState: boolean,
): ReactorDocumentSummary {
  const globalState = (document.state as Record<string, unknown>).global;
  const stateName =
    globalState && typeof globalState === "object"
      ? (globalState as Record<string, unknown>).name
      : undefined;
  return {
    documentId: document.header.id,
    documentType: document.header.documentType,
    // Models usually keep the display name in state; header name can lag.
    name:
      (typeof stateName === "string" && stateName) ||
      document.header.name ||
      "",
    slug: document.header.slug,
    ...(withState ? { state: globalState } : {}),
  };
}

// Reducer failures don't reject execute(): the operation is still recorded,
// with the reason on operation.error and the state left exactly as it was.

// So a dispatch that wrote nothing at all comes back looking like any other,
// and the only thing standing between that and a step reporting success is
// this. It fails the call instead, which is what the block needs: its payload
// may be model output, and a silent no-op is the worst way to learn that.

// Per scope, because an operation's index counts within its own scope. A tail
// taken across all of them sorts one scope's indexes against another's, and a
// document-scope CREATE_DOCUMENT at index 0 displaces the failed global
// operation at index 0 that a fresh document's first dispatch leaves.
function assertOperationsApplied(
  document: PHDocument,
  dispatched: readonly { scope?: string }[],
): void {
  const perScope = new Map<string, number>();
  for (const action of dispatched) {
    const scope = action.scope ?? "global";
    perScope.set(scope, (perScope.get(scope) ?? 0) + 1);
  }
  const failed = [...perScope].flatMap(([scope, count]) =>
    [...(document.operations[scope] ?? [])]
      .sort((a, b) => a.index - b.index)
      .slice(-count)
      .filter((operation) => operation.error !== undefined),
  );
  if (failed.length === 0) return;
  // All of them: a payload a model wrote tends to fail a field at a time, and
  // naming only the first sends the author back for another run to find the
  // next. The reducer's own message carries the field and what it wanted.
  throw new Error(
    failed
      .map(
        (operation) =>
          `Action ${operation.action.type} failed: ${operation.error ?? "unknown error"}`,
      )
      .join("; "),
  );
}

export class SubgraphReactorPort implements ReactorPort {
  constructor(private readonly host: WorkflowRuntimeHostDeps) {}

  private get client() {
    return this.host.reactorClient;
  }

  async models(): Promise<ReactorModelSummary[]> {
    const page = await this.client.getDocumentModelModules();
    return page.results
      .map((module) => module.documentModel.global)
      .map((model) => ({ documentType: model.id, name: model.name }))
      .filter((entry) => entry.documentType)
      .sort((a, b) => a.documentType.localeCompare(b.documentType));
  }

  async model(documentType: string): Promise<ReactorModelDetail> {
    const module = await this.client.getDocumentModelModule(documentType);
    const model = module.documentModel.global;
    const latest = model.specifications.at(-1);
    return {
      documentType,
      name: model.name,
      stateSchema: latest?.state.global.schema ?? null,
      actions: [
        // flatMap rather than filter+map: an unnamed operation is dropped, and
        // this is the shape that narrows `name` for the caller's benefit.
        ...(latest?.modules ?? []).flatMap((specModule) =>
          specModule.operations.flatMap((operation) =>
            operation.name
              ? [
                  {
                    type: operation.name,
                    module: specModule.name,
                    inputSchema: operation.schema ?? null,
                  },
                ]
              : [],
          ),
        ),
        ...BASE_ACTIONS,
      ],
    };
  }

  async get(input: {
    documentId: string;
    branch?: string;
  }): Promise<ReactorDocumentSummary> {
    const document = await this.client.get<PHDocument>(input.documentId);
    return documentSummary(document, true);
  }

  async find(input: ReactorFindInput): Promise<ReactorDocumentSummary[]> {
    const limit = input.limit ?? FIND_PAGE_LIMIT;
    let results: PHDocument[];
    if (input.documentType) {
      // The index takes both, so a step that named a type and a drive gets
      // documents of that type in that drive — not every document of the type.
      results = await this.findByType(
        input.documentType,
        limit,
        input.parentId,
      );
    } else if (input.parentId) {
      const page = await this.client.find(
        { parentId: input.parentId },
        undefined,
        {
          cursor: "",
          limit,
        },
      );
      results = page.results;
    } else {
      // The index rejects an empty filter, so sweep every installed type.
      const types = (await this.models()).map((model) => model.documentType);
      const pages = await Promise.all(
        types.map((type) => this.findByType(type, limit)),
      );
      results = pages.flat();
    }
    const seen = new Set<string>();
    return (
      results
        .filter((document) => {
          if (seen.has(document.header.id)) return false;
          seen.add(document.header.id);
          return true;
        })
        // The index cannot query state, so a state match is applied to the page
        // that was read. A caller that needs to match across more documents than
        // the page holds raises `limit`; silently matching a prefix of the type
        // would look like "no such document".
        .filter((document) => matchesState(document, input.match))
        .map((document) => documentSummary(document, input.withState === true))
    );
  }

  async create(input: ReactorCreateInput): Promise<ReactorDocumentSummary> {
    const target = input.parentId
      ? await this.resolveDriveTarget(input.parentId)
      : null;
    if (!target) {
      const created = await this.client.createEmpty<PHDocument>(
        input.documentType,
        { parentIdentifier: input.parentId },
      );
      // createEmpty takes no name, so naming it is a first operation. The
      // drive path below sets the header instead, before the file lands.
      if (!input.name) return documentSummary(created, true);
      const naming = createAction("SET_NAME", { name: input.name });
      const named = await this.client.execute<PHDocument>(
        created.header.id,
        "main",
        [naming],
      );
      assertOperationsApplied(named, [naming]);
      return documentSummary(named, true);
    }
    // createEmpty only records the parent relationship; a drive also needs an
    // ADD_FILE node, or the document is created but invisible in the drive.
    const module = await this.client.getDocumentModelModule(input.documentType);
    const empty = module.utils.createDocument() as PHDocument;
    // The node name comes from the header, so set it before the file lands.
    if (input.name) empty.header.name = input.name;
    const created = await this.client.drives.addFile<PHDocument>(
      target.driveId,
      empty,
      target.parentFolder,
    );
    return documentSummary(created, true);
  }

  async execute(input: ReactorExecuteInput): Promise<ReactorDocumentSummary> {
    const actions: Action[] = input.actions.map((entry) =>
      createAction(
        entry.type,
        entry.input,
        undefined,
        undefined,
        entry.scope ?? "global",
      ),
    );
    const document = await this.client.execute<PHDocument>(
      input.documentId,
      input.branch ?? "main",
      actions,
    );
    // The inputs rather than the built actions: they carry the scope each one
    // was asked for, which is the scope its operation was appended to.
    assertOperationsApplied(document, input.actions);
    return documentSummary(document, true);
  }

  private async findByType(
    type: string,
    limit: number,
    parentId?: string,
  ): Promise<PHDocument[]> {
    try {
      const page = await this.client.find(
        { type, ...(parentId ? { parentId } : {}) },
        undefined,
        { cursor: "", limit },
      );
      return page.results;
    } catch {
      // One unreadable model must not sink a whole-reactor sweep.
      return [];
    }
  }

  // Where a new document's drive node belongs, when the parent implies one.
  private async resolveDriveTarget(
    parentId: string,
  ): Promise<DriveTarget | null> {
    try {
      const parent = await this.client.get<PHDocument>(parentId);
      // A plain document parent gets a relationship only, as before.
      return DRIVE_DOCUMENT_TYPES.has(parent.header.documentType)
        ? { driveId: parent.header.id }
        : null;
    } catch {
      // Not a document at all: it may be a folder node inside a drive.
      return this.findFolderDrive(parentId);
    }
  }

  private async findFolderDrive(nodeId: string): Promise<DriveTarget | null> {
    // Every type that counts as a drive, not just the common one: a folder in
    // a reactor-drive would otherwise look like no drive at all.
    const pages = await Promise.all(
      [...DRIVE_DOCUMENT_TYPES].map((type) =>
        this.findByType(type, FIND_PAGE_LIMIT),
      ),
    );
    for (const drive of pages.flat()) {
      try {
        const node = await this.client.drives.getNode(drive.header.id, nodeId);
        if (node.kind === "folder") {
          return { driveId: drive.header.id, parentFolder: nodeId };
        }
      } catch {
        // Not in this drive.
      }
    }
    return null;
  }
}

// Design-time `ctx.reactor`, bound to the caller behind the GraphQL request.
// A piece's options()/props() code is the package's, not the reactor's.
export class ScopedDesignTimeReactorPort implements ReactorPort {
  private readonly inner: SubgraphReactorPort;

  constructor(
    private readonly host: WorkflowRuntimeHostDeps,
    private readonly caller: WorkflowCaller | undefined,
  ) {
    this.inner = new SubgraphReactorPort(host);
  }

  models(): Promise<ReactorModelSummary[]> {
    return this.inner.models();
  }

  model(documentType: string): Promise<ReactorModelDetail> {
    return this.inner.model(documentType);
  }

  async get(input: {
    documentId: string;
    branch?: string;
  }): Promise<ReactorDocumentSummary> {
    if (!this.caller) throw new Error(DESIGN_TIME_CALLER_REQUIRED);
    await this.host.assertCanRead(input.documentId, this.caller);
    return this.inner.get(input);
  }

  async find(input: ReactorFindInput): Promise<ReactorDocumentSummary[]> {
    const found = await this.inner.find(input);
    // Filtered rather than refused: one unreadable document in a sweep is not
    // the caller's error, and the list is what options() offers.
    const allowed = await Promise.all(
      found.map((document) => this.canRead(document.documentId)),
    );
    return found.filter((_, index) => allowed[index]);
  }

  create(_input: ReactorCreateInput): Promise<ReactorDocumentSummary> {
    return Promise.reject(new Error(DESIGN_TIME_WRITES_REFUSED));
  }

  execute(_input: ReactorExecuteInput): Promise<ReactorDocumentSummary> {
    return Promise.reject(new Error(DESIGN_TIME_WRITES_REFUSED));
  }

  private async canRead(documentId: string): Promise<boolean> {
    if (!this.caller) return false;
    return this.host
      .assertCanRead(documentId, this.caller)
      .then(() => true)
      .catch(() => false);
  }
}
