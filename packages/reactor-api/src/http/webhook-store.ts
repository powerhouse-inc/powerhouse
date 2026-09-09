import type { IRelationalDb } from "@powerhousedao/shared/processors";
import { randomBytes } from "node:crypto";

/**
 * Where webhook tokens live. Core-owned and relational rather than per-host, so
 * any host in a fleet can serve any endpoint: a provider's registered URL keeps
 * working after a restart, a redeploy or a request landing on another replica.
 */
export interface WebhookEndpointRow {
  token: string;
  /** The owning package's npm name. */
  namespace: string;
  /** The registration within that package. */
  endpoint: string;
  /** The caller's own key, e.g. a document id. Never appears in the URL. */
  ownerKey: string;
  createdAt: string;
}

export interface IWebhookStore {
  init(): Promise<void>;
  /** Returns the existing token for this key, or mints one. */
  ensure(
    namespace: string,
    endpoint: string,
    ownerKey: string,
  ): Promise<WebhookEndpointRow>;
  find(token: string): Promise<WebhookEndpointRow | undefined>;
  list(namespace: string, endpoint?: string): Promise<WebhookEndpointRow[]>;
  revoke(namespace: string, endpoint: string, ownerKey: string): Promise<void>;
  /** True when this delivery has been seen before, within the TTL. */
  seen(token: string, key: string, ttlSeconds: number): Promise<boolean>;
}

const TOKEN_BYTES = 16;
export const TOKEN_PATTERN = /^[0-9a-f]{32}$/;

/** Opaque and unguessable: the URL is a bearer capability held by a third party. */
export function newWebhookToken(): string {
  return randomBytes(TOKEN_BYTES).toString("hex");
}

const NAMESPACE = "reactor_webhooks";

type Schema = {
  webhook_endpoints: {
    token: string;
    namespace: string;
    endpoint: string;
    owner_key: string;
    created_at: string;
  };
  webhook_deliveries: {
    token: string;
    dedupe_key: string;
    seen_at: string;
    /** Who won the insert; see the comment in seen(). */
    claim_id: string;
  };
};

/** Relational implementation, over the reactor's own database. */
export class RelationalWebhookStore implements IWebhookStore {
  #db: IRelationalDb<Schema> | undefined;

  constructor(private readonly relationalDb: IRelationalDb) {}

  async init(): Promise<void> {
    if (this.#db) return;
    const db = await this.relationalDb.createNamespace<Schema>(NAMESPACE);

    await db.schema
      .createTable("webhook_endpoints")
      .ifNotExists()
      .addColumn("token", "text", (col) => col.primaryKey())
      .addColumn("namespace", "text", (col) => col.notNull())
      .addColumn("endpoint", "text", (col) => col.notNull())
      .addColumn("owner_key", "text", (col) => col.notNull())
      .addColumn("created_at", "text", (col) => col.notNull())
      .execute();

    // One token per (package, registration, key): re-registering an endpoint
    // must not mint a second URL for something a provider already knows.
    await db.schema
      .createIndex("webhook_endpoints_owner")
      .ifNotExists()
      .on("webhook_endpoints")
      .columns(["namespace", "endpoint", "owner_key"])
      .unique()
      .execute();

    await db.schema
      .createTable("webhook_deliveries")
      .ifNotExists()
      .addColumn("token", "text", (col) => col.notNull())
      .addColumn("dedupe_key", "text", (col) => col.notNull())
      .addColumn("seen_at", "text", (col) => col.notNull())
      .addColumn("claim_id", "text", (col) => col.notNull())
      .execute();

    await db.schema
      .createIndex("webhook_deliveries_key")
      .ifNotExists()
      .on("webhook_deliveries")
      .columns(["token", "dedupe_key"])
      .unique()
      .execute();

    // Every delivery prunes by `seen_at`; unindexed that is a scan of the
    // whole table, growing with it.
    await db.schema
      .createIndex("webhook_deliveries_seen_at")
      .ifNotExists()
      .on("webhook_deliveries")
      .columns(["seen_at"])
      .execute();

    this.#db = db;
  }

  get #handle(): IRelationalDb<Schema> {
    if (!this.#db) throw new Error("Webhook store used before init()");
    return this.#db;
  }

  async ensure(
    namespace: string,
    endpoint: string,
    ownerKey: string,
  ): Promise<WebhookEndpointRow> {
    const existing = await this.#handle
      .selectFrom("webhook_endpoints")
      .selectAll()
      .where("namespace", "=", namespace)
      .where("endpoint", "=", endpoint)
      .where("owner_key", "=", ownerKey)
      .executeTakeFirst();
    if (existing) return toRow(existing);

    const row: Schema["webhook_endpoints"] = {
      token: newWebhookToken(),
      namespace,
      endpoint,
      owner_key: ownerKey,
      created_at: new Date().toISOString(),
    };

    await this.#handle
      .insertInto("webhook_endpoints")
      .values(row)
      // Two hosts arming the same endpoint at once must agree on one token.
      .onConflict((oc) =>
        oc.columns(["namespace", "endpoint", "owner_key"]).doNothing(),
      )
      .execute();

    const settled = await this.#handle
      .selectFrom("webhook_endpoints")
      .selectAll()
      .where("namespace", "=", namespace)
      .where("endpoint", "=", endpoint)
      .where("owner_key", "=", ownerKey)
      .executeTakeFirst();

    return settled ? toRow(settled) : toRow(row);
  }

  async find(token: string): Promise<WebhookEndpointRow | undefined> {
    if (!TOKEN_PATTERN.test(token)) return undefined;
    const found = await this.#handle
      .selectFrom("webhook_endpoints")
      .selectAll()
      .where("token", "=", token)
      .executeTakeFirst();
    return found ? toRow(found) : undefined;
  }

  async list(
    namespace: string,
    endpoint?: string,
  ): Promise<WebhookEndpointRow[]> {
    let query = this.#handle
      .selectFrom("webhook_endpoints")
      .selectAll()
      .where("namespace", "=", namespace);
    if (endpoint) query = query.where("endpoint", "=", endpoint);
    return (await query.execute()).map(toRow);
  }

  async revoke(
    namespace: string,
    endpoint: string,
    ownerKey: string,
  ): Promise<void> {
    await this.#handle
      .deleteFrom("webhook_endpoints")
      .where("namespace", "=", namespace)
      .where("endpoint", "=", endpoint)
      .where("owner_key", "=", ownerKey)
      .execute();
  }

  async seen(token: string, key: string, ttlSeconds: number): Promise<boolean> {
    const now = Date.now();
    const cutoff = new Date(now - ttlSeconds * 1000).toISOString();

    // Prune first, so a key that has aged out is redeliverable rather than
    // rejected forever.
    await this.#handle
      .deleteFrom("webhook_deliveries")
      .where("seen_at", "<", cutoff)
      .execute();

    // Insert-then-read-back rather than trusting an affected-row count: what
    // "on conflict do nothing" reports differs by driver, and reading it wrong
    // means either every delivery looks like a redelivery or none does. The
    // claim id settles it without a transaction, so two hosts racing the same
    // delivery still agree on which one runs it.
    const claimId = randomBytes(16).toString("hex");
    await this.#handle
      .insertInto("webhook_deliveries")
      .values({
        token,
        dedupe_key: key,
        seen_at: new Date(now).toISOString(),
        claim_id: claimId,
      })
      .onConflict((oc) => oc.columns(["token", "dedupe_key"]).doNothing())
      .execute();

    const settled = await this.#handle
      .selectFrom("webhook_deliveries")
      .select("claim_id")
      .where("token", "=", token)
      .where("dedupe_key", "=", key)
      .executeTakeFirst();

    // Our claim stands: this is the first delivery. Anyone else's: a retry.
    return settled?.claim_id !== claimId;
  }
}

function toRow(row: Schema["webhook_endpoints"]): WebhookEndpointRow {
  return {
    token: row.token,
    namespace: row.namespace,
    endpoint: row.endpoint,
    ownerKey: row.owner_key,
    createdAt: row.created_at,
  };
}

/** In-memory store, for hosts with no relational database and for tests. */
export class MemoryWebhookStore implements IWebhookStore {
  readonly #byToken = new Map<string, WebhookEndpointRow>();
  readonly #deliveries = new Map<string, number>();

  init(): Promise<void> {
    return Promise.resolve();
  }

  ensure(
    namespace: string,
    endpoint: string,
    ownerKey: string,
  ): Promise<WebhookEndpointRow> {
    for (const row of this.#byToken.values()) {
      if (
        row.namespace === namespace &&
        row.endpoint === endpoint &&
        row.ownerKey === ownerKey
      ) {
        return Promise.resolve(row);
      }
    }
    const row: WebhookEndpointRow = {
      token: newWebhookToken(),
      namespace,
      endpoint,
      ownerKey,
      createdAt: new Date().toISOString(),
    };
    this.#byToken.set(row.token, row);
    return Promise.resolve(row);
  }

  find(token: string): Promise<WebhookEndpointRow | undefined> {
    return Promise.resolve(this.#byToken.get(token));
  }

  list(namespace: string, endpoint?: string): Promise<WebhookEndpointRow[]> {
    return Promise.resolve(
      [...this.#byToken.values()].filter(
        (row) =>
          row.namespace === namespace &&
          (endpoint === undefined || row.endpoint === endpoint),
      ),
    );
  }

  revoke(namespace: string, endpoint: string, ownerKey: string): Promise<void> {
    for (const [token, row] of this.#byToken) {
      if (
        row.namespace === namespace &&
        row.endpoint === endpoint &&
        row.ownerKey === ownerKey
      ) {
        this.#byToken.delete(token);
      }
    }
    return Promise.resolve();
  }

  seen(token: string, key: string, ttlSeconds: number): Promise<boolean> {
    const now = Date.now();
    for (const [k, at] of this.#deliveries) {
      if (at < now - ttlSeconds * 1000) this.#deliveries.delete(k);
    }
    const composite = `${token}|${key}`;
    if (this.#deliveries.has(composite)) return Promise.resolve(true);
    this.#deliveries.set(composite, now);
    return Promise.resolve(false);
  }
}
