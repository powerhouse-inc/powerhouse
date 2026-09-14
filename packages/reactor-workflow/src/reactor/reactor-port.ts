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
      results = await this.findByType(input.documentType, limit);
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
      .map((document) => documentSummary(document, false));
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
      return documentSummary(created, true);
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
  ): Promise<PHDocument[]> {
    try {
      const page = await this.client.find({ type }, undefined, {
        cursor: "",
        limit,
      });
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
    const drives = await this.findByType(DRIVE_DOCUMENT_TYPE, FIND_PAGE_LIMIT);
    for (const drive of drives) {
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
