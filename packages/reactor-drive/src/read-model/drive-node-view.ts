import {
  parsePagingOptions,
  type PagedResults,
  type PagingOptions,
} from "@powerhousedao/reactor";
import type { Kysely } from "kysely";
import type { ReactorDriveDatabase } from "../schema/tables.js";
import type {
  ReactorDriveFileNode,
  ReactorDriveFolderNode,
  ReactorDriveNode,
} from "../types.js";
import type { IDriveReadModel } from "./interfaces.js";

const DEFAULT_LIMIT = 100;

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
    const { offset, limit } = parsePagingOptions(paging, DEFAULT_LIMIT);

    let query = this.db
      .selectFrom("DriveNode")
      .selectAll()
      .where("driveId", "=", driveId);

    if (parentFolder === null) {
      query = query.where("parentFolder", "is", null);
    } else if (parentFolder !== undefined) {
      query = query.where("parentFolder", "=", parentFolder);
    }

    const rows = await query
      .orderBy("createdAt", "asc")
      .orderBy("id", "asc")
      .limit(limit + 1)
      .offset(offset)
      .execute();

    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;

    return {
      results: sliced.map(rowToNode),
      options: { cursor: paging?.cursor ?? "", limit },
      nextCursor: hasMore ? String(offset + limit) : undefined,
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
