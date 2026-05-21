import { type PagedResults, type PagingOptions } from "@powerhousedao/reactor";
import type { Kysely } from "kysely";
import type { ReactorDriveDatabase } from "../schema/tables.js";
import type {
  ReactorDriveFileNode,
  ReactorDriveFolderNode,
  ReactorDriveNode,
} from "../types.js";
import type { IDriveReadModel } from "./interfaces.js";

const DEFAULT_LIMIT = 100;

type KeysetCursor = {
  createdAt: Date;
  id: string;
};

function parseListChildrenPaging(paging: PagingOptions | undefined): {
  limit: number;
  cursor: KeysetCursor | null;
} {
  if (paging === undefined) {
    return { limit: DEFAULT_LIMIT, cursor: null };
  }
  if (!Number.isInteger(paging.limit) || paging.limit < 1) {
    throw new Error(
      `Invalid paging limit: ${String(paging.limit)} (must be an integer >= 1)`,
    );
  }
  if (paging.cursor === "") {
    return { limit: paging.limit, cursor: null };
  }
  return { limit: paging.limit, cursor: decodeKeysetCursor(paging.cursor) };
}

function encodeKeysetCursor(createdAt: Date, id: string): string {
  return globalThis.btoa(
    JSON.stringify({ createdAt: createdAt.toISOString(), id }),
  );
}

function decodeKeysetCursor(cursor: string): KeysetCursor {
  let decoded: string;
  try {
    decoded = globalThis.atob(cursor);
  } catch {
    throw new Error(
      `Invalid paging cursor: ${JSON.stringify(cursor)} (must be a keyset cursor returned by a prior page)`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    throw new Error(
      `Invalid paging cursor: ${JSON.stringify(cursor)} (must be a keyset cursor returned by a prior page)`,
    );
  }
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    typeof (parsed as { createdAt?: unknown }).createdAt !== "string" ||
    typeof (parsed as { id?: unknown }).id !== "string"
  ) {
    throw new Error(
      `Invalid paging cursor: ${JSON.stringify(cursor)} (must be a keyset cursor returned by a prior page)`,
    );
  }
  const createdAt = new Date((parsed as { createdAt: string }).createdAt);
  if (Number.isNaN(createdAt.getTime())) {
    throw new Error(
      `Invalid paging cursor: ${JSON.stringify(cursor)} (createdAt is not a valid timestamp)`,
    );
  }
  return { createdAt, id: (parsed as { id: string }).id };
}

export class DriveNodeView implements IDriveReadModel {
  constructor(private readonly db: Kysely<ReactorDriveDatabase>) {}

  async getNode(
    driveId: string,
    nodeId: string,
  ): Promise<ReactorDriveNode | undefined> {
    const row = await this.db
      .selectFrom("DriveNode")
      .selectAll()
      .where("driveId", "=", driveId)
      .where("id", "=", nodeId)
      .executeTakeFirst();
    if (!row) return undefined;
    return rowToNode(row);
  }

  async listChildren(
    driveId: string,
    parentFolder: string | null | undefined,
    paging?: PagingOptions,
  ): Promise<PagedResults<ReactorDriveNode>> {
    const { limit, cursor } = parseListChildrenPaging(paging);

    let query = this.db
      .selectFrom("DriveNode")
      .selectAll()
      .where("driveId", "=", driveId);

    if (parentFolder === null) {
      query = query.where("parentFolder", "is", null);
    } else if (parentFolder !== undefined) {
      query = query.where("parentFolder", "=", parentFolder);
    }

    if (cursor !== null) {
      query = query.where((eb) =>
        eb(
          eb.refTuple("createdAt", "id"),
          ">",
          eb.tuple(cursor.createdAt, cursor.id),
        ),
      );
    }

    const rows = await query
      .orderBy("createdAt", "asc")
      .orderBy("id", "asc")
      .limit(limit + 1)
      .execute();

    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;
    const last = sliced[sliced.length - 1];

    return {
      results: sliced.map(rowToNode),
      options: { cursor: paging?.cursor ?? "", limit },
      nextCursor: hasMore
        ? encodeKeysetCursor(last.createdAt, last.id)
        : undefined,
    };
  }

  async listAll(driveId: string): Promise<ReactorDriveNode[]> {
    const rows = await this.db
      .selectFrom("DriveNode")
      .selectAll()
      .where("driveId", "=", driveId)
      .orderBy("createdAt", "asc")
      .orderBy("id", "asc")
      .execute();
    return rows.map(rowToNode);
  }

  async getDescendants(
    driveId: string,
    root: string,
  ): Promise<ReactorDriveNode[]> {
    const rows = await this.db
      .withRecursive("descendants", (qb) =>
        qb
          .selectFrom("DriveNode")
          .select([
            "driveId",
            "id",
            "kind",
            "name",
            "requestedName",
            "parentFolder",
            "documentType",
            "createdAt",
          ])
          .where("driveId", "=", driveId)
          .where("id", "=", root)
          .unionAll(
            qb
              .selectFrom("DriveNode")
              .innerJoin(
                "descendants",
                "DriveNode.parentFolder",
                "descendants.id",
              )
              .where("DriveNode.driveId", "=", driveId)
              .select([
                "DriveNode.driveId",
                "DriveNode.id",
                "DriveNode.kind",
                "DriveNode.name",
                "DriveNode.requestedName",
                "DriveNode.parentFolder",
                "DriveNode.documentType",
                "DriveNode.createdAt",
              ]),
          ),
      )
      .selectFrom("descendants")
      .select([
        "driveId",
        "id",
        "kind",
        "name",
        "requestedName",
        "parentFolder",
        "documentType",
      ])
      .orderBy("createdAt", "asc")
      .orderBy("id", "asc")
      .execute();
    return rows.map(rowToNode);
  }
}

type DriveNodeRow = {
  driveId: string;
  id: string;
  kind: "file" | "folder";
  name: string;
  requestedName: string;
  parentFolder: string | null;
  documentType: string | null;
};

function rowToNode(row: DriveNodeRow): ReactorDriveNode {
  if (row.kind === "file") {
    if (row.documentType === null) {
      throw new Error(
        `DriveNode ${row.driveId}/${row.id}: file row has null documentType, which violates the schema CHECK constraint`,
      );
    }
    const node: ReactorDriveFileNode = {
      kind: "file",
      id: row.id,
      driveId: row.driveId,
      parentFolder: row.parentFolder,
      name: row.name,
      documentType: row.documentType,
    };
    return node;
  }
  const node: ReactorDriveFolderNode = {
    kind: "folder",
    id: row.id,
    driveId: row.driveId,
    parentFolder: row.parentFolder,
    name: row.name,
  };
  return node;
}
