import {
  type DocumentDriveDocument,
  type FolderNode,
  type Node,
} from "document-drive";
import { PHDocument } from "document-model";
import { atomWithReducer } from "jotai/utils";
import { type Loadable } from "jotai/vanilla/utils/loadable";
import slug from "slug";
import { type NodeKind, type Reactor } from "./types.js";

export function atomWithCompare<Value>(
  initialValue: Value,
  areEqual: (prev: Value, next: Value) => boolean,
) {
  return atomWithReducer(initialValue, (prev: Value, next: Value) => {
    if (areEqual(prev, next)) {
      return prev;
    }

    return next;
  });
}
export function makeDriveUrlComponent(
  drive: DocumentDriveDocument | undefined,
) {
  if (!drive) return "";
  return `/d/${slug(drive.header.slug)}`;
}

export function makeNodeUrlComponent(node: Node | undefined) {
  if (!node) return "";
  const nodeName = node.name;
  if (!nodeName) return slug(node.id);
  return slug(`${nodeName}-${node.id}`);
}

function extractNodeSlug(path: string): string | null {
  const match = /^\/d\/[^/]+\/([^/]+)$/.exec(path);
  return match ? match[1] : null;
}
function findUuid(input: string | undefined | undefined) {
  if (!input) return undefined;
  const uuidRegex =
    /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/;
  const match = uuidRegex.exec(input);
  return match ? match[0] : undefined;
}

export function extractNodeFromPath(path: string) {
  const nodeSlug = extractNodeSlug(path);
  if (!nodeSlug) return undefined;
  const uuid = findUuid(nodeSlug);
  if (!uuid) return undefined;
  return uuid;
}

export function extractDriveFromPath(path: string): string | null {
  const match = /^\/d\/([^/]+)/.exec(path);
  return match ? match[1] : null;
}
export async function getReactorDrives(
  reactor: Reactor | undefined,
): Promise<DocumentDriveDocument[]> {
  if (!reactor) return [];
  const driveIds = await reactor.getDrives();
  const drives = await Promise.all(
    driveIds.map(async (id) => {
      const drive = await reactor.getDrive(id);
      return drive;
    }),
  );
  console.log("getting reactor drives", drives);
  return drives;
}

export async function getReactorDocuments(
  reactor: Reactor | undefined,
): Promise<PHDocument[]> {
  if (!reactor) return [];
  const driveIds = await reactor.getDrives();
  const documents = (
    await Promise.all(
      driveIds.map(async (driveId) => {
        const documentIds = await reactor.getDocuments(driveId);
        const documents = await Promise.all(
          documentIds.map(async (id) => await reactor.getDocument(driveId, id)),
        );
        return documents;
      }),
    )
  ).flat();
  console.log("getting reactor documents", documents);
  return documents;
}

export function makeNodes(drives: DocumentDriveDocument[]): Node[] {
  const nodes: Node[] = [];
  for (const drive of drives) {
    const driveFolderNode: FolderNode = {
      id: drive.header.id,
      name: drive.state.global.name,
      kind: "DRIVE",
      parentFolder: null,
    };
    nodes.push(driveFolderNode);
    for (const n of drive.state.global.nodes) {
      nodes.push({
        id: n.id,
        name: n.name,
        kind: n.kind.toUpperCase() as NodeKind,
        parentFolder: n.parentFolder ?? drive.header.id,
      });
    }
  }
  return nodes;
}

export function unwrapLoadable<T>(loadable: Loadable<T>) {
  if (loadable.state !== "hasData") return undefined;
  return loadable.data;
}
