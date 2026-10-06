import type { PHDocument } from "@powerhousedao/shared/document-model";
import { DriveCollectionId } from "../cache/operation-index-types.js";
import type { IDocumentModelRegistry } from "../registry/interfaces.js";
import type {
  PagedResults,
  PagingOptions,
  SearchFilter,
  ViewFilter,
} from "../shared/types.js";
import type {
  InspectorDriveInfo,
  InspectorDriveIntegrity,
  InspectorDriveIntegrityRef,
  InspectorDrivePage,
} from "./types.js";

/** `IReactor` reads as the host; `IReactorClient` gates on `view.subject`. */
export type InspectorDocumentReader = {
  find(
    search: SearchFilter,
    view?: ViewFilter,
    paging?: PagingOptions,
  ): Promise<PagedResults<PHDocument>>;
  get(id: string, view?: ViewFilter): Promise<PHDocument>;
};

const DRIVE_DOCUMENT_TYPE = "powerhouse/document-drive";

const INTEGRITY_FIND_BATCH_SIZE = 500;

const DEFAULT_DRIVE_PAGE_SIZE = 100;

type DriveNode = {
  id: string;
  kind: string;
  documentType: string | undefined;
};

type DriveState = {
  name: string;
  icon: string | undefined;
  nodes: DriveNode[];
  totalNodeCount: number;
  folderCount: number;
  otherNodeCount: number;
  unreadableNodeCount: number;
};

// Drive state is untrusted: an old, partial or malformed node must not throw.
function readDriveState(doc: PHDocument): DriveState {
  const global = (doc.state as { global?: unknown } | undefined)?.global as
    | { name?: unknown; icon?: unknown; nodes?: unknown }
    | undefined;
  const rawNodes: unknown[] = Array.isArray(global?.nodes) ? global.nodes : [];
  const nodes: DriveNode[] = [];
  let folderCount = 0;
  let otherNodeCount = 0;
  let unreadableNodeCount = 0;
  for (const raw of rawNodes) {
    if (typeof raw !== "object" || raw === null) {
      unreadableNodeCount += 1;
      continue;
    }
    const node = raw as {
      id?: unknown;
      kind?: unknown;
      documentType?: unknown;
    };
    if (typeof node.id !== "string" || typeof node.kind !== "string") {
      unreadableNodeCount += 1;
      continue;
    }
    nodes.push({
      id: node.id,
      kind: node.kind,
      documentType:
        typeof node.documentType === "string" ? node.documentType : undefined,
    });
    if (node.kind === "folder") {
      folderCount += 1;
    } else if (node.kind !== "file") {
      otherNodeCount += 1;
    }
  }
  return {
    name: typeof global?.name === "string" ? global.name : doc.header.name,
    icon: typeof global?.icon === "string" ? global.icon : undefined,
    nodes,
    totalNodeCount: rawNodes.length,
    folderCount,
    otherNodeCount,
    unreadableNodeCount,
  };
}

function fileNodesOf(nodes: DriveNode[]): DriveNode[] {
  return nodes.filter((node) => node.kind === "file");
}

function toDriveInfo(doc: PHDocument): InspectorDriveInfo {
  const driveId = doc.header.id;
  const branch = doc.header.branch;
  const state = readDriveState(doc);
  return {
    driveId,
    name: state.name,
    branch,
    collectionId: DriveCollectionId.forDrive(driveId, branch).key,
    documentType: doc.header.documentType,
    nodeCount: state.totalNodeCount,
    fileCount: fileNodesOf(state.nodes).length,
    folderCount: state.folderCount,
    otherNodeCount: state.otherNodeCount,
    unreadableNodeCount: state.unreadableNodeCount,
    icon: state.icon,
  };
}

/** Drive listing and integrity, every read made through one reader and view. */
export class DriveInspection {
  constructor(
    private readonly reader: InspectorDocumentReader,
    private readonly registry?: IDocumentModelRegistry,
    private readonly view: ViewFilter = {},
  ) {}

  async listDrives(
    cursor?: string,
    limit?: number,
  ): Promise<InspectorDrivePage> {
    const page = await this.reader.find(
      { type: DRIVE_DOCUMENT_TYPE },
      this.view,
      { cursor: cursor ?? "", limit: limit ?? DEFAULT_DRIVE_PAGE_SIZE },
    );
    return {
      results: page.results.map(toDriveInfo),
      nextCursor: page.nextCursor,
    };
  }

  async checkDriveIntegrity(
    driveId: string,
    branch: string,
  ): Promise<InspectorDriveIntegrity> {
    const drive = await this.reader.get(driveId, { ...this.view, branch });
    const fileNodes = fileNodesOf(readDriveState(drive).nodes);
    const present = await this.presentDocumentIds(
      fileNodes.map((node) => node.id),
      branch,
    );
    const supported = this.supportedDocumentTypes();
    const missingDocuments: InspectorDriveIntegrityRef[] = [];
    const unsupportedTypes: InspectorDriveIntegrityRef[] = [];
    for (const node of fileNodes) {
      if (!present.has(node.id)) {
        missingDocuments.push({
          id: node.id,
          documentType: node.documentType ?? "",
        });
      }
      if (
        supported !== undefined &&
        node.documentType !== undefined &&
        !supported.has(node.documentType)
      ) {
        unsupportedTypes.push({ id: node.id, documentType: node.documentType });
      }
    }
    return {
      driveId,
      checkedNodeCount: fileNodes.length,
      totalFileNodeCount: fileNodes.length,
      missingDocuments,
      unsupportedTypes,
    };
  }

  private async presentDocumentIds(
    ids: string[],
    branch: string,
  ): Promise<Set<string>> {
    const present = new Set<string>();
    for (
      let start = 0;
      start < ids.length;
      start += INTEGRITY_FIND_BATCH_SIZE
    ) {
      const batch = ids.slice(start, start + INTEGRITY_FIND_BATCH_SIZE);
      let page = await this.reader.find(
        { ids: batch },
        { ...this.view, branch },
        { cursor: "", limit: batch.length },
      );
      for (const doc of page.results) {
        present.add(doc.header.id);
      }
      while (page.nextCursor !== undefined && page.next) {
        page = await page.next();
        for (const doc of page.results) {
          present.add(doc.header.id);
        }
      }
    }
    return present;
  }

  // No registry: skip the check rather than report every type unsupported.
  private supportedDocumentTypes(): Set<string> | undefined {
    if (!this.registry) {
      return undefined;
    }
    return new Set(
      this.registry
        .getAllModules()
        .map((module) => module.documentModel.global.id),
    );
  }
}
