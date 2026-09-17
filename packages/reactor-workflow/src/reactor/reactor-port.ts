// The host's half of `ctx.reactor`: the operations a package piece asks for,
// run against this reactor through the subgraph's client.

// Everything here is what could not cross the worker boundary — model modules
// and their factories, drive nodes, a PHDocument's operations — so the piece
// keeps the block's own semantics and the reactor stays on this side of it.
import type { BaseSubgraph } from "@powerhousedao/reactor-api";
import type {
  ReactorCreateInput,
  ReactorDocumentSummary,
  ReactorExecuteInput,
  ReactorFindInput,
  ReactorModelDetail,
  ReactorModelSummary,
  ReactorPort,
} from "@powerhousedao/reactor-connectors";
import { createAction, type Action, type PHDocument } from "document-model";

const DRIVE_DOCUMENT_TYPE = "powerhouse/document-drive";
const DRIVE_DOCUMENT_TYPES = new Set([
  DRIVE_DOCUMENT_TYPE,
  "powerhouse/reactor-drive",
]);

// The index rejects an empty filter, so a typeless sweep asks per type; this
// caps what each one contributes before the caller slices.
const FIND_PAGE_LIMIT = 100;

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

// Reducer failures don't reject execute(); they land on the operations. Fail
// the call when any of the freshly appended operations carries an error.
function assertOperationsApplied(document: PHDocument, count: number): void {
  const operations = Object.values(document.operations).flat();
  const recent = operations
    .sort((a, b) => a.index - b.index)
    .slice(-Math.max(count, 1));
  const failed = recent.find((operation) => operation.error !== undefined);
  if (failed) {
    throw new Error(
      `Action ${failed.action.type} failed: ${failed.error ?? "unknown error"}`,
    );
  }
}

export class SubgraphReactorPort implements ReactorPort {
  constructor(private readonly subgraph: BaseSubgraph) {}

  private get client() {
    return this.subgraph.reactorClient;
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
      results = await this.findByType(input.documentType, limit, input.parentId);
    } else if (input.parentId) {
      const page = await this.client.find({ parentId: input.parentId }, undefined, {
        cursor: "",
        limit,
      });
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
    return results
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
      .map((document) => documentSummary(document, input.withState === true));
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
      const named = await this.client.execute<PHDocument>(
        created.header.id,
        "main",
        [createAction("SET_NAME", { name: input.name })],
      );
      assertOperationsApplied(named, 1);
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
    assertOperationsApplied(document, actions.length);
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
