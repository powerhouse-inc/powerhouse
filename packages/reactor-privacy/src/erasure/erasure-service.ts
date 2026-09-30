import {
  DEFAULT_DRIVE_CONTAINER_TYPES,
  DEFAULT_MAX_PURGE_OPERATIONS,
  DocumentNotDeletedError,
} from "@powerhousedao/reactor";
import {
  assertDeploymentSecret,
  type DeploymentSecret,
} from "../subject-hash.js";
import {
  expandIds,
  groupReferencers,
  operationCount,
  type DocumentFacts,
} from "./documents.js";
import { appendAudit, type ErasureDb } from "./ledger.js";
import { storedRequester } from "./redact.js";
import type {
  ErasureItem,
  ErasurePlan,
  ErasurePlanItem,
  ErasureRequest,
  IErasureService,
} from "./types.js";

export const DEFAULT_ERASURE_DEADLINE_MS = 30 * 24 * 60 * 60 * 1000;

export class ErasureRequestNotFoundError extends Error {
  constructor(readonly requestId: string) {
    super(`No erasure request ${requestId}`);
    this.name = "ErasureRequestNotFoundError";
  }
}

export type ErasureServiceOptions = {
  /** The reactor schema handle: `module.database.withSchema(REACTOR_SCHEMA)`. */
  db: ErasureDb;
  deploymentSecret: DeploymentSecret;
  /** The executor's cap; plan() reports each document against it. */
  maxPurgeOperations?: number;
  driveContainerTypes?: ReadonlySet<string>;
  /** Default deadline, from the request time. */
  deadlineMs?: number;
  now?: () => Date;
  newRequestId?: () => string;
};

function isLive(fact: DocumentFacts | undefined): boolean {
  return !fact || (!fact.purged && !fact.deleted);
}

export class ErasureService implements IErasureService {
  private readonly db: ErasureDb;
  private readonly secret: DeploymentSecret;
  private readonly maxPurgeOperations: number;
  private readonly driveTypes: ReadonlySet<string>;
  private readonly deadlineMs: number;
  private readonly now: () => Date;
  private readonly newRequestId: () => string;

  constructor(options: ErasureServiceOptions) {
    assertDeploymentSecret(options.deploymentSecret);
    this.db = options.db;
    this.secret = options.deploymentSecret;
    this.maxPurgeOperations =
      options.maxPurgeOperations ?? DEFAULT_MAX_PURGE_OPERATIONS;
    this.driveTypes = new Set(
      options.driveContainerTypes ?? DEFAULT_DRIVE_CONTAINER_TYPES,
    );
    this.deadlineMs = options.deadlineMs ?? DEFAULT_ERASURE_DEADLINE_MS;
    this.now = options.now ?? (() => new Date());
    this.newRequestId = options.newRequestId ?? (() => crypto.randomUUID());
  }

  async plan(ids: string[]): Promise<ErasurePlan> {
    const { expanded, facts } = await expandIds(this.db, ids, this.driveTypes);
    const items: ErasurePlanItem[] = [];
    for (const { documentId, expandedFrom } of expanded) {
      const fact = facts.get(documentId);
      items.push({
        documentId,
        expandedFrom,
        live: isLive(fact),
        operationCount: await operationCount(this.db, documentId),
        groupReferencers: fact?.purged
          ? []
          : await groupReferencers(this.db, documentId),
      });
    }
    return { maxPurgeOperations: this.maxPurgeOperations, items };
  }

  async request(
    ids: string[],
    opts: { requestedBy: string; deadline?: Date; allowLarge?: string[] },
  ): Promise<ErasureRequest> {
    if (ids.length === 0) throw new Error("An erasure request names no ids");
    const { expanded, facts } = await expandIds(this.db, ids, this.driveTypes);
    const live = expanded
      .map((item) => item.documentId)
      .filter((id) => isLive(facts.get(id)));
    if (live.length > 0) {
      throw new DocumentNotDeletedError(
        live[0]!,
        `Delete these documents before requesting their erasure: ${live.join(", ")}`,
      );
    }

    const requestId = this.newRequestId();
    const requestedAt = this.now();
    const deadline =
      opts.deadline ?? new Date(requestedAt.getTime() + this.deadlineMs);
    const allowLarge = new Set(opts.allowLarge ?? []);
    const drives = new Map<string, string[]>();
    for (const { documentId, expandedFrom } of expanded) {
      if (expandedFrom === null) continue;
      drives.set(expandedFrom, [
        ...(drives.get(expandedFrom) ?? []),
        documentId,
      ]);
    }

    await this.db.transaction().execute(async (trx) => {
      await trx
        .insertInto("erasure_requests")
        .values({
          requestId,
          subjectHash: null,
          requestedBy: storedRequester(this.secret, opts.requestedBy),
          requestedAt,
          deadline,
          status: "open",
        })
        .execute();
      await trx
        .insertInto("erasure_items")
        .values(
          expanded.map(({ documentId }) => ({
            requestId,
            documentId,
            status: "waiting" as const,
            allowLarge: allowLarge.has(documentId),
            markerOrdinal: null,
            lastError: null,
            updatedAt: requestedAt,
          })),
        )
        .execute();
      await appendAudit(trx, this.secret, {
        requestId,
        documentId: null,
        event: "requested",
        detail: {
          ids: [...new Set(ids)],
          allowLarge: [...allowLarge],
          deadline: deadline.toISOString(),
        },
        at: requestedAt,
      });
      for (const [driveId, members] of drives) {
        await appendAudit(trx, this.secret, {
          requestId,
          documentId: driveId,
          event: "expanded",
          detail: { members },
          at: requestedAt,
        });
      }
    });

    return this.status(requestId);
  }

  async status(requestId: string): Promise<ErasureRequest> {
    const request = await this.db
      .selectFrom("erasure_requests")
      .selectAll()
      .where("requestId", "=", requestId)
      .executeTakeFirst();
    if (!request) throw new ErasureRequestNotFoundError(requestId);
    const items = await this.db
      .selectFrom("erasure_items")
      .selectAll()
      .where("requestId", "=", requestId)
      .orderBy("documentId")
      .execute();
    return {
      requestId: request.requestId,
      subjectHash: request.subjectHash,
      requestedBy: request.requestedBy,
      requestedAt: new Date(request.requestedAt),
      deadline: new Date(request.deadline),
      status: request.status,
      items: items.map((item): ErasureItem => ({
        documentId: item.documentId,
        status: item.status,
        allowLarge: item.allowLarge,
        markerOrdinal:
          item.markerOrdinal === null ? null : Number(item.markerOrdinal),
        lastError: item.lastError,
        updatedAt: new Date(item.updatedAt),
      })),
    };
  }
}
