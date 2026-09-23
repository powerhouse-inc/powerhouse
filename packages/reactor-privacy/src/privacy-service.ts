import type {
  DocumentPurgeResult,
  DocumentPurgeService,
  PurgePlan,
} from "@powerhousedao/reactor";
import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";
import { randomUUID } from "node:crypto";
import type {
  PrivacyAuditLogTable,
  ReactorPrivacyDatabase,
} from "./schema/tables.js";
import { asAddress, subjectHash, type SubjectRole } from "./subject.js";

type SyncRemotesDatabase = {
  sync_remotes: { name: string; bound_address: string | null };
};

/** The permission store a purge also clears; reactor-api's service fits it. */
export interface IDocumentPermissionEraser {
  eraseDocument(documentId: string): Promise<Record<string, number>>;
  listForSubject?(address: string): Promise<unknown>;
}

export type DisclosedDocument = {
  documentId: string;
  roles: SubjectRole[];
  firstOrdinal: number;
  lastOrdinal: number;
};

export type DisclosureReport = {
  subjectHash: string;
  documents: DisclosedDocument[];
  /** Sync remotes bound to the identifier. */
  boundRemotes: string[];
  /** The permission rows naming it, when document permissions are on. */
  permissions: unknown;
  /** What this index cannot see, stated with every answer. */
  notIndexed: string[];
};

export type ErasureRequest = {
  requestId?: string;
  /** Who asked: the data subject or their representative. */
  requester: string;
  /** The administrator who approved the erasure. */
  authoriser: string;
  /** The subject the request concerns, recorded only as its hash. */
  identifier?: string;
  skipRemotes?: string[];
  allowGroupInUse?: boolean;
};

export type PermissionOutcome = {
  documentId: string;
  rowsDeleted?: Record<string, number>;
  error?: string;
};

export type ErasureResult = {
  requestId: string;
  purge: DocumentPurgeResult;
  permissions: PermissionOutcome[] | "not-configured";
};

export type AuditEntry = Omit<Selectable<PrivacyAuditLogTable>, "ordinal"> & {
  ordinal: number;
};

export const NOT_INDEXED = [
  "Personal data typed into a document's own model-specific state is not indexed.",
  "Purged documents' ids and titles remain in their parent drive's log.",
  "Peers and browser replicas keep their own copies; erasure is per deployment.",
];

export type PrivacyServiceOptions = {
  /** The reactor database handle, scoped to the reactor schema. */
  db: Kysely<unknown>;
  purgeService: DocumentPurgeService;
  secret: string;
  permissions?: IDocumentPermissionEraser;
};

/** Access and erasure requests over the documents-by-subject index. */
export class PrivacyService {
  private readonly db: Kysely<ReactorPrivacyDatabase>;
  private readonly purgeService: DocumentPurgeService;
  private readonly secret: string;
  private readonly permissions?: IDocumentPermissionEraser;

  constructor(options: PrivacyServiceOptions) {
    this.db = options.db as Kysely<ReactorPrivacyDatabase>;
    this.purgeService = options.purgeService;
    this.secret = options.secret;
    this.permissions = options.permissions;
  }

  /** Answers "what do you hold about X": the documents, not their contents. */
  async listDocuments(
    identifier: string,
    authoriser?: string,
  ): Promise<DisclosureReport> {
    const hash = subjectHash(this.secret, identifier);
    const rows = await this.db
      .selectFrom("subject_documents")
      .select(["documentId", "role", "firstOrdinal", "lastOrdinal"])
      .where("subjectHash", "=", hash)
      .orderBy("documentId")
      .orderBy("role")
      .execute();

    const byDocument = new Map<string, DisclosedDocument>();
    for (const row of rows) {
      const entry = byDocument.get(row.documentId) ?? {
        documentId: row.documentId,
        roles: [],
        firstOrdinal: Number(row.firstOrdinal),
        lastOrdinal: Number(row.lastOrdinal),
      };
      entry.roles.push(row.role as SubjectRole);
      entry.firstOrdinal = Math.min(
        entry.firstOrdinal,
        Number(row.firstOrdinal),
      );
      entry.lastOrdinal = Math.max(entry.lastOrdinal, Number(row.lastOrdinal));
      byDocument.set(row.documentId, entry);
    }

    const remotes = await (this.db as unknown as Kysely<SyncRemotesDatabase>)
      .selectFrom("sync_remotes")
      .select("name")
      .where(
        sql<string>`lower(bound_address)`,
        "=",
        identifier.trim().toLowerCase(),
      )
      .orderBy("name")
      .execute();

    const permissions = this.permissions?.listForSubject
      ? await this.permissions.listForSubject(identifier)
      : "not-configured";

    const report: DisclosureReport = {
      subjectHash: hash,
      documents: [...byDocument.values()],
      boundRemotes: remotes.map((row) => row.name),
      permissions,
      notIndexed: NOT_INDEXED,
    };

    await this.audit({
      kind: "disclosure",
      status: "answered",
      authoriser: authoriser ?? null,
      subjectHash: hash,
      documentIds: report.documents.map((document) => document.documentId),
      detail: { boundRemotes: report.boundRemotes },
    });

    return report;
  }

  planErasure(ids: string[]): Promise<PurgePlan> {
    return this.purgeService.planPurge(ids);
  }

  /** Purges the documents, then clears their permission rows and records both. */
  async eraseDocuments(
    ids: string[],
    request: ErasureRequest,
  ): Promise<ErasureResult> {
    const requestId = request.requestId ?? randomUUID();
    const hash =
      request.identifier === undefined
        ? null
        : subjectHash(this.secret, request.identifier);
    const base = {
      kind: "erasure" as const,
      requestId,
      requester: request.requester,
      authoriser: request.authoriser,
      subjectHash: hash,
      documentIds: ids,
    };

    let purge: DocumentPurgeResult;
    try {
      purge = await this.purgeService.purgeDocuments(ids, {
        directiveId: requestId,
        purgedBy: request.authoriser,
        skipRemotes: request.skipRemotes,
        allowGroupInUse: request.allowGroupInUse,
      });
    } catch (error) {
      await this.audit({
        ...base,
        status: "refused",
        detail: {
          error: error instanceof Error ? error.message : String(error),
          errorName: error instanceof Error ? error.name : "Error",
        },
      });
      throw error;
    }

    let permissions: ErasureResult["permissions"] = "not-configured";
    if (this.permissions) {
      permissions = [];
      for (const documentId of purge.purged) {
        try {
          permissions.push({
            documentId,
            rowsDeleted: await this.permissions.eraseDocument(documentId),
          });
        } catch (error) {
          permissions.push({
            documentId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    await this.audit({
      ...base,
      status: purge.status,
      detail: {
        purged: purge.purged,
        alreadyPurged: purge.alreadyPurged,
        skippedRemotes: purge.skippedRemotes.map((remote) => ({
          remoteName: remote.remoteName,
          documentId: remote.documentId,
          connectionState: remote.connectionState,
        })),
        removedRemotes: purge.removedRemotes,
        readModels: purge.readModels.map((outcome) => ({
          readModelId: outcome.readModelId,
          rowsAffected: outcome.rowsAffected,
          covered: outcome.covered,
          ...(outcome.error !== undefined ? { error: outcome.error } : {}),
        })),
        unacknowledgedShards: purge.unacknowledgedShards,
        permissions,
      },
    });

    return { requestId, purge, permissions };
  }

  async auditLog(limit = 100): Promise<AuditEntry[]> {
    const rows = await this.db
      .selectFrom("privacy_audit_log")
      .selectAll()
      .orderBy("ordinal", "desc")
      .limit(limit)
      .execute();
    return rows.map((row) => ({ ...row, ordinal: Number(row.ordinal) }));
  }

  /** The log's own retention: removes entries older than the cutoff. */
  async pruneAuditLog(olderThan: Date): Promise<number> {
    const result = await this.db
      .deleteFrom("privacy_audit_log")
      .where("createdAtUtc", "<", olderThan)
      .executeTakeFirst();
    return Number(result.numDeletedRows);
  }

  /** An address is personal data the log must not keep; a reference is not. */
  private auditedParty(party: string | null | undefined): string | null {
    if (party === undefined || party === null) return null;
    return asAddress(party) ? `hmac:${subjectHash(this.secret, party)}` : party;
  }

  private async audit(entry: {
    kind: "disclosure" | "erasure";
    status: string;
    requestId?: string;
    requester?: string | null;
    authoriser?: string | null;
    subjectHash: string | null;
    documentIds: string[];
    detail: unknown;
  }): Promise<void> {
    await this.db
      .insertInto("privacy_audit_log")
      .values({
        id: randomUUID(),
        kind: entry.kind,
        status: entry.status,
        requestId: entry.requestId ?? null,
        requester: this.auditedParty(entry.requester),
        authoriser: entry.authoriser ?? null,
        subjectHash: entry.subjectHash,
        documentIds: JSON.stringify(entry.documentIds),
        detail: JSON.stringify(entry.detail),
      })
      .execute();
  }
}
