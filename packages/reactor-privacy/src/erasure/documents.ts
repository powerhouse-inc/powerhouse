import {
  DriveCollectionId,
  findPurged,
  KyselyDocumentPurger,
  type StorageDatabase,
} from "@powerhousedao/reactor";
import { sql, type Kysely } from "kysely";
import type { ErasureDb } from "./ledger.js";

/** What the ledger needs to know about one document before it is erased. */
export type DocumentFacts = {
  documentId: string;
  documentType: string | null;
  purged: boolean;
  /** Every branch holding a document-scope stream has a DELETE_DOCUMENT. */
  deleted: boolean;
  branches: string[];
};

export async function documentFacts(
  db: ErasureDb,
  ids: string[],
): Promise<Map<string, DocumentFacts>> {
  const facts = new Map<string, DocumentFacts>();
  if (ids.length === 0) return facts;
  const purged = await findPurged(db, ids);

  const streams = await db
    .selectFrom("Operation")
    .select(["documentId", "branch", "documentType"])
    .select(
      sql<boolean>`bool_or(action->>'type' = 'DELETE_DOCUMENT' and coalesce(error, '') = '')`.as(
        "deleted",
      ),
    )
    .where(sql<boolean>`"documentId" = any(${ids}::text[])`)
    .where("scope", "=", "document")
    .groupBy(["documentId", "branch", "documentType"])
    .execute();

  for (const id of ids) {
    const own = streams.filter((row) => row.documentId === id);
    facts.set(id, {
      documentId: id,
      documentType: own[0]?.documentType ?? null,
      purged: purged.has(id),
      deleted: own.length > 0 && own.every((row) => Boolean(row.deleted)),
      branches: [...new Set(own.map((row) => row.branch))],
    });
  }
  return facts;
}

/** A drive's ever-members with no open membership elsewhere and no tombstone. */
export async function driveMembers(
  db: ErasureDb,
  driveId: string,
  branches: string[],
): Promise<string[]> {
  const purger = new KyselyDocumentPurger(
    db as unknown as Kysely<StorageDatabase>,
  );
  const members = new Set<string>();
  for (const branch of branches.length > 0 ? branches : ["main"]) {
    const collectionId = DriveCollectionId.forDrive(driveId, branch).key;
    for (const member of await purger.collectionMembers(
      collectionId,
      driveId,
    )) {
      if (!member.openElsewhere) members.add(member.documentId);
    }
  }
  const purged = await findPurged(db, members);
  return [...members].filter((id) => !purged.has(id)).sort();
}

export type ExpandedId = { documentId: string; expandedFrom: string | null };

/** The requested ids, then each drive's members; first mention wins. */
export async function expandIds(
  db: ErasureDb,
  ids: string[],
  driveTypes: ReadonlySet<string>,
): Promise<{ expanded: ExpandedId[]; facts: Map<string, DocumentFacts> }> {
  const requested = [...new Set(ids)];
  const facts = await documentFacts(db, requested);
  const expanded: ExpandedId[] = requested.map((documentId) => ({
    documentId,
    expandedFrom: null,
  }));
  const seen = new Set(requested);

  for (const id of requested) {
    const fact = facts.get(id)!;
    if (fact.purged || !driveTypes.has(fact.documentType ?? "")) continue;
    for (const member of await driveMembers(db, id, fact.branches)) {
      if (seen.has(member)) continue;
      seen.add(member);
      expanded.push({ documentId: member, expandedFrom: id });
    }
  }

  const missing = expanded
    .map((item) => item.documentId)
    .filter((id) => !facts.has(id));
  for (const [id, fact] of await documentFacts(db, missing)) {
    facts.set(id, fact);
  }
  return { expanded, facts };
}

export async function operationCount(
  db: ErasureDb,
  documentId: string,
): Promise<number> {
  return new KyselyDocumentPurger(
    db as unknown as Kysely<StorageDatabase>,
  ).operationCount(documentId);
}

export async function groupReferencers(
  db: ErasureDb,
  groupId: string,
): Promise<string[]> {
  return new KyselyDocumentPurger(
    db as unknown as Kysely<StorageDatabase>,
  ).groupReferencersInHistory(groupId);
}
