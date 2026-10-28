import type { IDriveReadClient } from "@powerhousedao/reactor";
import type {
  DocumentDriveDocument,
  Node,
} from "@powerhousedao/shared/document-drive";
import { vi } from "vitest";
import type { DriveNodesCache } from "../../src/hooks/drive-nodes.js";

/** A `read.drives` over `nodesOf`, paging by offset cursors as the
 * in-process client does; `nodesOf` returning undefined is a missing drive. */
export function fakeDriveReader(
  nodesOf: (driveId: string) => readonly Node[] | undefined,
) {
  const listNodes = vi.fn(
    (
      driveId: string,
      parentFolder?: string | null,
      paging?: { cursor: string; limit: number },
    ) => {
      const all = nodesOf(driveId);
      if (!all) return Promise.reject(new Error(`Drive not found: ${driveId}`));
      const filtered =
        parentFolder === undefined
          ? [...all]
          : all.filter((n) => (n.parentFolder ?? null) === parentFolder);
      const offset = Number(paging?.cursor || 0);
      const limit = paging?.limit ?? filtered.length;
      const results = filtered.slice(offset, offset + limit);
      const end = offset + limit;
      return Promise.resolve({
        results,
        options: paging ?? { cursor: "", limit },
        ...(end < filtered.length ? { nextCursor: String(end) } : {}),
      });
    },
  );
  const getNode = vi.fn((driveId: string, nodeId: string) => {
    const node = nodesOf(driveId)?.find((n) => n.id === nodeId);
    return node
      ? Promise.resolve(node)
      : Promise.reject(new Error(`Node not found: ${nodeId}`));
  });
  const reader = { listNodes, getNode } as unknown as IDriveReadClient;
  return { reader, listNodes, getNode };
}

/** `fakeDriveReader` over drive documents' node lists. */
export function driveReaderFromDocuments(
  drives: () => readonly DocumentDriveDocument[] | undefined,
) {
  return fakeDriveReader(
    (driveId) =>
      drives()?.find((d) => d.header.id === driveId)?.state.global.nodes,
  );
}

/** A node cache already holding every node of `drives`. */
export function driveNodesCacheOf(
  ...drives: DocumentDriveDocument[]
): DriveNodesCache {
  return new Map(
    drives.map((drive) => {
      const nodes = drive.state.global.nodes;
      return [
        drive.header.id,
        {
          byId: new Map(nodes.map((n) => [n.id, n])),
          nodes,
          loaded: "all" as const,
        },
      ];
    }),
  );
}
