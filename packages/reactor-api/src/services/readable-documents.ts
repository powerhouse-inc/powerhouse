import type { IReactorReadClient } from "@powerhousedao/reactor";
import { DocumentChangeType } from "@powerhousedao/reactor";
import type { PagedResults } from "@powerhousedao/reactor";
import type { IRelationalDb } from "@powerhousedao/shared/processors";
import { hashNamespace } from "@powerhousedao/shared/processors";
import { sql, type Kysely, type RawBuilder } from "kysely";
import type { AuthorizationConfig } from "./authorization.service.js";
import { AuthorizationPolicy } from "./authorization.service.js";
import type { DocumentPermissionService } from "./document-permission.service.js";

/**
 * The read-permission closure as a read model: `readable_documents(user_id,
 * document_id)` in the processors' relational database, so an index subgraph
 * decides "may the caller see this row" with one join instead of one
 * authorization call per row.
 *
 * It is a projection of the host's own permission data, never an authority:
 * the write path keeps deciding from the permission tables in the reactor
 * store (`IAuthorizationService`), and nothing here is consulted for a
 * write. The projection mirrors four small facts into its own namespace,
 * documents, `child` edges, protection and grants, and recomputes the
 * closure from them in one SQL statement whenever one of them changes:
 *
 * - `'*'` for a document that is unprotected along its whole ancestor chain
 *   (everyone may read it; `DEFAULT_PROTECTION` fills a missing row),
 * - the owner of a protected document,
 * - every holder of a grant on the document or any ancestor (READ is the
 *   floor, so any level counts).
 *
 * Listed admins are a bypass, never rows. Under OPEN everyone reads
 * everything and under ADMIN_ONLY only admins read, so the projection keeps
 * no rows for those policies; `filterFor` answers from the policy alone.
 *
 * Kept current by the permission service's change notifications and the
 * reactor's document and relationship change events; rebuilt from the
 * reactor and the permission service at start. Eventually consistent, no
 * worse than the permission cache's TTL. The document's own `state.auth`
 * policy (the reactor's read gate under `authEnforcement`) is not projected
 * here; a subgraph that must honour it keeps the per-document reactor check.
 */

export const READABLE_DOCUMENTS_NAMESPACE = "ph_readable_documents";

/** The `user_id` that stands for every caller, anonymous included. */
export const EVERYONE = "*";

/** Document types that root the `child` hierarchy: drives. */
export const DEFAULT_ROOT_TYPES: readonly string[] = [
  "powerhouse/document-drive",
  "powerhouse/reactor-drive",
];

/**
 * What a subgraph applies to a document-keyed query for one caller: every
 * row, no row, or the rows whose document the projection lists for the user.
 */
export type ReadableFilter =
  | { kind: "all" }
  | { kind: "none" }
  | { kind: "ids"; schema: string; userId: string };

export interface ReadableDocumentsLike {
  /** The projection's table schema in the relational database. */
  readonly schema: string;
  /** Resolves when the first rebuild has finished; fails closed before that. */
  readonly ready: Promise<void>;
  filterFor(userAddress: string | undefined): ReadableFilter;
}

interface ReadableSchema {
  documents: { document_id: string };
  edges: { parent_id: string; child_id: string };
  protection: {
    document_id: string;
    protected: boolean;
    owner_id: string | null;
  };
  grants: { document_id: string; user_id: string };
  readable_documents: { user_id: string; document_id: string };
}

export interface ReadableDocumentsDeps {
  relationalDb: IRelationalDb;
  read: Pick<
    IReactorReadClient,
    "find" | "getOutgoingRelationshipEdges" | "subscribe"
  >;
  /** Absent under OPEN and ADMIN_ONLY, where the projection keeps no rows. */
  permissions?: DocumentPermissionService;
  config: AuthorizationConfig;
  logger?: {
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
  };
  /** How long changes are coalesced before one recompute (default 100 ms). */
  debounceMs?: number;
  rootTypes?: readonly string[];
  pageSize?: number;
}

/**
 * `select document_id from <schema>.readable_documents where user_id in
 * (:user, '*')`, for a `where document_id in (...)` on an index table.
 */
export function readableDocumentsSubquery(
  filter: Extract<ReadableFilter, { kind: "ids" }>,
): RawBuilder<string> {
  return sql<string>`(select document_id from ${sql.table(`${filter.schema}.readable_documents`)} where user_id in (${filter.userId}, ${EVERYONE}))`;
}

export interface ApplyReadableFilterOptions {
  /**
   * Rows that pass whatever the filter says, named by a column value: the
   * structure rows of an index that are not documents (a files listing's
   * folders), which are listed whenever their scope is.
   */
  passWhen?: { column: string; equals: string | number | boolean };
}

/**
 * Applies a caller's filter to a query over a document-keyed index table:
 * unchanged for `all`, no row for `none`, `where <column> in (readable ids)`
 * for `ids`. `column` is the table's document id column, qualified when the
 * query joins.
 */
export function applyReadableFilter<
  QB extends {
    where(...args: any[]): QB;
  },
>(
  query: QB,
  column: string,
  filter: ReadableFilter,
  options: ApplyReadableFilterOptions = {},
): QB {
  const pass = options.passWhen
    ? sql`${sql.ref(options.passWhen.column)} = ${options.passWhen.equals}`
    : undefined;
  switch (filter.kind) {
    case "all":
      return query;
    case "none":
      return query.where(pass ?? sql`false`);
    case "ids": {
      const listed = sql`${sql.ref(column)} in ${readableDocumentsSubquery(filter)}`;
      return query.where(pass ? sql`(${listed} or ${pass})` : listed);
    }
  }
}

/**
 * Whether `filter` lists one document: the scope gate of an index query (its
 * drive or folder), asked of the same rows the row filter joins on.
 */
export async function isDocumentListed(
  db: Kysely<unknown>,
  filter: ReadableFilter,
  documentId: string,
): Promise<boolean> {
  switch (filter.kind) {
    case "all":
      return true;
    case "none":
      return false;
    case "ids": {
      const result = await sql<{
        listed: number;
      }>`select 1 as listed from ${sql.table(`${filter.schema}.readable_documents`)} where document_id = ${documentId} and user_id in (${filter.userId}, ${EVERYONE}) limit 1`.execute(
        db,
      );
      return result.rows.length > 0;
    }
  }
}

export class ReadableDocumentsProjection implements ReadableDocumentsLike {
  readonly schema: string;
  readonly ready: Promise<void>;
  readonly #deps: ReadableDocumentsDeps;
  readonly #maintained: boolean;
  #db: Kysely<ReadableSchema> | undefined;
  #resolveReady!: () => void;
  #rejectReady!: (error: unknown) => void;
  #unsubscribe: (() => void) | undefined;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #chain: Promise<void> = Promise.resolve();
  #pending = false;
  #stopped = false;

  constructor(deps: ReadableDocumentsDeps) {
    this.#deps = deps;
    this.schema = hashNamespace(READABLE_DOCUMENTS_NAMESPACE);
    this.#maintained =
      deps.config.policy === AuthorizationPolicy.DOCUMENT_PERMISSIONS &&
      deps.permissions !== undefined;
    this.ready = new Promise<void>((resolve, reject) => {
      this.#resolveReady = resolve;
      this.#rejectReady = reject;
    });
    // Nobody awaits `ready` before `start()`; a failed start is reported there.
    this.ready.catch(() => undefined);
  }

  /** Creates the tables, rebuilds the closure, and follows changes. */
  async start(): Promise<void> {
    if (!this.#maintained) {
      this.#resolveReady();
      return;
    }
    try {
      const db = (await this.#deps.relationalDb.createNamespace(
        READABLE_DOCUMENTS_NAMESPACE,
      )) as unknown as Kysely<ReadableSchema>;
      this.#db = db;
      await this.#ensureTables(db);
      this.#unsubscribe = this.#deps.read.subscribe({}, (event) => {
        this.#onDocumentChange(event).catch((error: unknown) => {
          this.#deps.logger?.warn(
            "readable-documents: a change could not be applied: @error",
            error,
          );
        });
      });
      this.#unsubscribePermissions = this.#deps.permissions!.onChange(
        (documentId) => {
          this.#onPermissionChange(documentId).catch((error: unknown) => {
            this.#deps.logger?.warn(
              "readable-documents: a permission change could not be applied: @error",
              error,
            );
          });
        },
      );
      await this.rebuild();
      this.#resolveReady();
    } catch (error) {
      this.#rejectReady(error);
      throw error;
    }
  }

  #unsubscribePermissions: (() => void) | undefined;

  async stop(): Promise<void> {
    this.#stopped = true;
    this.#unsubscribe?.();
    this.#unsubscribePermissions?.();
    if (this.#timer) clearTimeout(this.#timer);
    await this.#chain;
  }

  filterFor(userAddress: string | undefined): ReadableFilter {
    const address = userAddress?.toLowerCase();
    const { policy, admins } = this.#deps.config;
    if (policy === AuthorizationPolicy.OPEN) return { kind: "all" };
    const admin = address !== undefined && admins.includes(address);
    if (policy === AuthorizationPolicy.ADMIN_ONLY) {
      return admin ? { kind: "all" } : { kind: "none" };
    }
    if (admin) return { kind: "all" };
    if (!this.#db || !this.#isReady) return { kind: "none" };
    return { kind: "ids", schema: this.schema, userId: address ?? EVERYONE };
  }

  #isReady = false;

  /**
   * Rebuilds the mirrors from the reactor and the permission service, then
   * recomputes the closure. Serialised with the incremental updates.
   */
  rebuild(): Promise<void> {
    return this.#enqueue(async () => {
      const db = this.#db!;
      const pageSize = this.#deps.pageSize ?? 500;
      const ids = await this.#allDocumentIds(pageSize);
      const edges = await this.#allEdges(pageSize);
      const snapshots = await this.#snapshotsOf(ids, pageSize);
      await db.transaction().execute(async (trx) => {
        await trx.deleteFrom("documents").execute();
        await trx.deleteFrom("edges").execute();
        await trx.deleteFrom("protection").execute();
        await trx.deleteFrom("grants").execute();
        for (const chunk of chunks(ids, pageSize)) {
          await trx
            .insertInto("documents")
            .values(chunk.map((document_id) => ({ document_id })))
            .execute();
        }
        for (const chunk of chunks(edges, pageSize)) {
          await trx.insertInto("edges").values(chunk).execute();
        }
        const protection = [...snapshots.values()].map((s) => ({
          document_id: s.documentId,
          protected: s.isProtected,
          owner_id: s.ownerAddress,
        }));
        for (const chunk of chunks(protection, pageSize)) {
          await trx.insertInto("protection").values(chunk).execute();
        }
        const grants = [...snapshots.values()].flatMap((s) =>
          [...s.grants.keys()].map((user_id) => ({
            document_id: s.documentId,
            user_id,
          })),
        );
        for (const chunk of chunks(grants, pageSize)) {
          await trx.insertInto("grants").values(chunk).execute();
        }
        await this.#recompute(trx);
      });
      this.#isReady = true;
      this.#deps.logger?.info(
        `readable-documents: rebuilt (${ids.length} documents, ${edges.length} edges, ${snapshots.size} protected or granted)`,
      );
    });
  }

  async #onDocumentChange(event: {
    type: DocumentChangeType;
    documents: { header: { id: string } }[];
    context?: { parentId?: string; childId?: string };
  }): Promise<void> {
    const db = this.#db;
    if (!db || this.#stopped) return;
    const ids = event.documents.map((d) => d.header.id);
    switch (event.type) {
      case DocumentChangeType.Created: {
        const snapshots = await this.#snapshotsOf(ids, ids.length || 1);
        await this.#enqueue(async () => {
          for (const document_id of ids) {
            await db
              .insertInto("documents")
              .values({ document_id })
              .onConflict((oc) => oc.column("document_id").doNothing())
              .execute();
          }
          await this.#applySnapshots(db, snapshots);
        });
        break;
      }
      case DocumentChangeType.Deleted: {
        await this.#enqueue(async () => {
          for (const id of ids) {
            await db
              .deleteFrom("documents")
              .where("document_id", "=", id)
              .execute();
            await db
              .deleteFrom("edges")
              .where((eb) =>
                eb.or([eb("parent_id", "=", id), eb("child_id", "=", id)]),
              )
              .execute();
            await db
              .deleteFrom("protection")
              .where("document_id", "=", id)
              .execute();
            await db
              .deleteFrom("grants")
              .where("document_id", "=", id)
              .execute();
          }
        });
        break;
      }
      case DocumentChangeType.ChildAdded:
      case DocumentChangeType.ParentAdded: {
        const edge = edgeOf(event);
        if (!edge) return;
        await this.#enqueue(async () => {
          await db
            .insertInto("edges")
            .values(edge)
            .onConflict((oc) =>
              oc.columns(["parent_id", "child_id"]).doNothing(),
            )
            .execute();
        });
        break;
      }
      case DocumentChangeType.ChildRemoved:
      case DocumentChangeType.ParentRemoved: {
        const edge = edgeOf(event);
        if (!edge) return;
        await this.#enqueue(async () => {
          await db
            .deleteFrom("edges")
            .where("parent_id", "=", edge.parent_id)
            .where("child_id", "=", edge.child_id)
            .execute();
        });
        break;
      }
      default:
        return;
    }
    this.#scheduleRecompute();
  }

  async #onPermissionChange(documentId: string): Promise<void> {
    const db = this.#db;
    if (!db || this.#stopped) return;
    const snapshots = await this.#snapshotsOf([documentId], 1);
    await this.#enqueue(async () => {
      await this.#applySnapshots(db, snapshots);
    });
    this.#scheduleRecompute();
  }

  async #applySnapshots(
    db: Kysely<ReadableSchema>,
    snapshots: Map<string, PermissionSnapshotLike>,
  ): Promise<void> {
    for (const s of snapshots.values()) {
      await db
        .insertInto("protection")
        .values({
          document_id: s.documentId,
          protected: s.isProtected,
          owner_id: s.ownerAddress,
        })
        .onConflict((oc) =>
          oc.column("document_id").doUpdateSet({
            protected: s.isProtected,
            owner_id: s.ownerAddress,
          }),
        )
        .execute();
      await db
        .deleteFrom("grants")
        .where("document_id", "=", s.documentId)
        .execute();
      const users = [...s.grants.keys()];
      if (users.length > 0) {
        await db
          .insertInto("grants")
          .values(
            users.map((user_id) => ({ document_id: s.documentId, user_id })),
          )
          .execute();
      }
    }
  }

  #scheduleRecompute(): void {
    if (this.#stopped) return;
    this.#pending = true;
    if (this.#timer) return;
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      if (!this.#pending) return;
      this.#pending = false;
      void this.#enqueue(async () => {
        const db = this.#db;
        if (!db) return;
        await db.transaction().execute((trx) => this.#recompute(trx));
      }).catch((error: unknown) => {
        this.#deps.logger?.warn(
          "readable-documents: recompute failed: @error",
          error,
        );
      });
    }, this.#deps.debounceMs ?? 100);
  }

  /** The closure, in one statement (UNION dedups, so a cycle terminates). */
  async #recompute(db: Kysely<ReadableSchema>): Promise<void> {
    const t = (name: keyof ReadableSchema) =>
      sql.table(`${this.schema}.${name}`);
    const defaultProtection = this.#deps.config.defaultProtection;
    await sql`delete from ${t("readable_documents")}`.execute(db);
    await sql`
      insert into ${t("readable_documents")} (user_id, document_id)
      with recursive anc(document_id, ancestor_id) as (
        select document_id, document_id from ${t("documents")}
        union
        select a.document_id, e.parent_id
        from anc a join ${t("edges")} e on e.child_id = a.ancestor_id
      ),
      prot as (
        select d.document_id,
               coalesce(p.protected, ${defaultProtection}) as protected,
               p.owner_id
        from ${t("documents")} d
        left join ${t("protection")} p on p.document_id = d.document_id
      )
      select ${EVERYONE}, a.document_id
      from anc a join prot p on p.document_id = a.ancestor_id
      group by a.document_id
      having bool_and(not p.protected)
      union
      select p.owner_id, p.document_id from prot p where p.owner_id is not null
      union
      select g.user_id, a.document_id
      from anc a join ${t("grants")} g on g.document_id = a.ancestor_id
    `.execute(db);
  }

  async #ensureTables(db: Kysely<ReadableSchema>): Promise<void> {
    await db.schema
      .createTable("documents")
      .ifNotExists()
      .addColumn("document_id", "text", (c) => c.primaryKey())
      .execute();
    await db.schema
      .createTable("edges")
      .ifNotExists()
      .addColumn("parent_id", "text", (c) => c.notNull())
      .addColumn("child_id", "text", (c) => c.notNull())
      .addPrimaryKeyConstraint("edges_pkey", ["parent_id", "child_id"])
      .execute();
    await db.schema
      .createIndex("edges_child_idx")
      .ifNotExists()
      .on("edges")
      .column("child_id")
      .execute();
    await db.schema
      .createTable("protection")
      .ifNotExists()
      .addColumn("document_id", "text", (c) => c.primaryKey())
      .addColumn("protected", "boolean", (c) => c.notNull())
      .addColumn("owner_id", "text")
      .execute();
    await db.schema
      .createTable("grants")
      .ifNotExists()
      .addColumn("document_id", "text", (c) => c.notNull())
      .addColumn("user_id", "text", (c) => c.notNull())
      .addPrimaryKeyConstraint("grants_pkey", ["document_id", "user_id"])
      .execute();
    await db.schema
      .createTable("readable_documents")
      .ifNotExists()
      .addColumn("user_id", "text", (c) => c.notNull())
      .addColumn("document_id", "text", (c) => c.notNull())
      .addPrimaryKeyConstraint("readable_documents_pkey", [
        "user_id",
        "document_id",
      ])
      .execute();
    await db.schema
      .createIndex("readable_documents_document_idx")
      .ifNotExists()
      .on("readable_documents")
      .column("document_id")
      .execute();
  }

  async #allDocumentIds(pageSize: number): Promise<string[]> {
    const ids: string[] = [];
    await eachPage(
      () =>
        this.#deps.read.find(
          {},
          { scopes: ["header"] },
          { cursor: "0", limit: pageSize },
        ),
      (page) => {
        for (const doc of page) ids.push(doc.header.id);
      },
    );
    return ids;
  }

  /** `child` edges, found by walking down from every drive. */
  async #allEdges(
    pageSize: number,
  ): Promise<{ parent_id: string; child_id: string }[]> {
    const roots: string[] = [];
    for (const type of this.#deps.rootTypes ?? DEFAULT_ROOT_TYPES) {
      await eachPage(
        () =>
          this.#deps.read.find(
            { type },
            { scopes: ["header"] },
            { cursor: "0", limit: pageSize },
          ),
        (page) => {
          for (const doc of page) roots.push(doc.header.id);
        },
      );
    }
    const edges: { parent_id: string; child_id: string }[] = [];
    const seen = new Set<string>();
    const queue = [...roots];
    while (queue.length > 0) {
      const parent = queue.shift()!;
      if (seen.has(parent)) continue;
      seen.add(parent);
      await eachPage(
        () =>
          this.#deps.read.getOutgoingRelationshipEdges(
            parent,
            "child",
            undefined,
            { cursor: "0", limit: pageSize },
          ),
        (page) => {
          for (const edge of page) {
            edges.push({ parent_id: parent, child_id: edge.targetId });
            if (!seen.has(edge.targetId)) queue.push(edge.targetId);
          }
        },
      );
    }
    return edges;
  }

  async #snapshotsOf(
    ids: string[],
    pageSize: number,
  ): Promise<Map<string, PermissionSnapshotLike>> {
    const out = new Map<string, PermissionSnapshotLike>();
    const permissions = this.#deps.permissions!;
    for (const chunk of chunks(ids, pageSize)) {
      const loaded = await permissions.loadPermissionSnapshots(chunk);
      for (const [id, snapshot] of loaded) {
        // A document with neither a protection row nor a grant adds nothing
        // the recompute does not already assume (the default protection).
        if (
          snapshot.ownerAddress === null &&
          snapshot.grants.size === 0 &&
          snapshot.isProtected === this.#deps.config.defaultProtection
        ) {
          continue;
        }
        out.set(id, snapshot);
      }
    }
    return out;
  }

  #enqueue(task: () => Promise<void>): Promise<void> {
    const run = this.#chain.then(task, task);
    this.#chain = run.catch(() => undefined);
    return run;
  }
}

interface PermissionSnapshotLike {
  documentId: string;
  isProtected: boolean;
  ownerAddress: string | null;
  grants: ReadonlyMap<string, unknown>;
}

function edgeOf(event: {
  context?: { parentId?: string; childId?: string };
}): { parent_id: string; child_id: string } | undefined {
  const parent = event.context?.parentId;
  const child = event.context?.childId;
  return parent && child ? { parent_id: parent, child_id: child } : undefined;
}

async function eachPage<T>(
  first: () => Promise<PagedResults<T>>,
  consume: (page: T[]) => void,
): Promise<void> {
  let page = await first();
  for (;;) {
    consume(page.results);
    if (page.results.length === 0 || !page.next) return;
    page = await page.next();
  }
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let at = 0; at < items.length; at += size) {
    out.push(items.slice(at, at + size));
  }
  return out;
}
