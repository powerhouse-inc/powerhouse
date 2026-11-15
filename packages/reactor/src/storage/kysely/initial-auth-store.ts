import { sql, type Kysely, type Transaction, type Selectable } from "kysely";
import {
  AuthBootstrapError,
  initialAuthDigest,
  parseInitialAuthCommitment,
  type Action,
  type Operation,
} from "@powerhousedao/shared/document-model";
import type { Database } from "./types.js";
import { acquirePurgeLocks, findPurged } from "./document-purges.js";

export type InitialAuthFact = {
  documentId: string;
  branch: string;
  revision: Record<string, number>;
};

export class KyselyInitialAuthStore {
  constructor(private readonly db: Kysely<Database> | Transaction<Database>) {}

  async intent(intentKey: string) {
    return this.db
      .selectFrom("InitialAuthCreation")
      .selectAll()
      .where("intentKey", "=", intentKey)
      .executeTakeFirst();
  }
  async document(documentId: string) {
    return this.db
      .selectFrom("InitialAuthCreation")
      .selectAll()
      .where("documentId", "=", documentId)
      .executeTakeFirst();
  }
  async pending(documentId: string): Promise<boolean> {
    return (
      (await this.db
        .selectFrom("InitialAuthInbox")
        .select("actionId")
        .where("documentId", "=", documentId)
        .limit(1)
        .executeTakeFirst()) !== undefined
    );
  }
  async prepare(input: {
    intentKey: string;
    requestDigest: string;
    documentId: string;
    envelope: Action[];
    facts?: InitialAuthFact[];
  }): Promise<Selectable<Database["InitialAuthCreation"]>> {
    if (!this.db.isTransaction)
      return this.db
        .transaction()
        .execute((transaction) =>
          new KyselyInitialAuthStore(transaction).prepare(input),
        );
    await this.assertLive(input.documentId);
    await this.db
      .insertInto("InitialAuthCreation")
      .values({
        ...input,
        envelope: JSON.stringify(input.envelope),
        facts: JSON.stringify(input.facts ?? []),
        committed: false,
      })
      .onConflict((conflict) => conflict.column("intentKey").doNothing())
      .execute();
    const row = await this.intent(input.intentKey);
    if (!row || row.requestDigest !== input.requestDigest)
      throw new AuthBootstrapError(
        "intent-conflict",
        "This creation intent was already used with a different request.",
      );
    if ((await findPurged(this.db, [row.documentId])).has(row.documentId))
      throw new AuthBootstrapError(
        "invalid-bootstrap",
        "The creation identity has been purged.",
      );
    return row;
  }
  async commit(documentId: string, envelope: Action[]) {
    const previous = await this.document(documentId);
    if (
      previous &&
      initialAuthDigest(previous.envelope) !== initialAuthDigest(envelope)
    )
      throw new AuthBootstrapError(
        "invalid-bootstrap",
        "The stored creation intent disagrees with the received envelope.",
      );
    if (!previous)
      await this.prepare({
        intentKey: `replicated:${documentId}`,
        requestDigest: initialAuthDigest(envelope),
        documentId,
        envelope,
      });
    await this.db
      .updateTable("InitialAuthCreation")
      .set({ committed: true })
      .where("documentId", "=", documentId)
      .execute();
    await this.db
      .deleteFrom("InitialAuthInbox")
      .where("documentId", "=", documentId)
      .where(
        "actionId",
        "in",
        envelope.map((action) => action.id),
      )
      .execute();
  }

  async discard(
    documentId: string,
    operations: readonly Operation[],
  ): Promise<void> {
    for (const operation of operations)
      await this.db
        .deleteFrom("InitialAuthInbox")
        .where("documentId", "=", documentId)
        .where("actionId", "=", operation.action.id)
        .where(
          "signerKey",
          "=",
          operation.action.context?.signer?.app.key ?? "",
        )
        .execute();
  }

  async followingScope<T>(apply: () => Promise<T>): Promise<T> {
    if (!this.db.isTransaction)
      throw new Error("Bootstrap suffix replay requires a transaction.");
    await sql`savepoint initial_auth_following`.execute(this.db);
    try {
      const result = await apply();
      await sql`release savepoint initial_auth_following`.execute(this.db);
      return result;
    } catch (error) {
      await sql`rollback to savepoint initial_auth_following`.execute(this.db);
      await sql`release savepoint initial_auth_following`.execute(this.db);
      throw error;
    }
  }

  async stage(
    documentId: string,
    operations: readonly Operation[],
  ): Promise<Operation[]> {
    if (!this.db.isTransaction)
      return this.db
        .transaction()
        .execute((transaction) =>
          new KyselyInitialAuthStore(transaction).stage(documentId, operations),
        );
    await this.assertLive(documentId);
    const history = await this.db
      .selectFrom("Operation")
      .select("documentId")
      .where("documentId", "=", documentId)
      .limit(1)
      .executeTakeFirst();
    if (history)
      throw new AuthBootstrapError(
        "invalid-bootstrap",
        "A bootstrap fragment cannot stage against an existing ordinary document identity.",
      );
    return this.insertFragments(documentId, operations);
  }

  async retainFollowing(
    documentId: string,
    operations: readonly Operation[],
  ): Promise<Operation[]> {
    await this.assertLive(documentId);
    if (!(await this.document(documentId))?.committed)
      throw new AuthBootstrapError(
        "incomplete-bootstrap",
        "Following fragments require a committed creation.",
      );
    return this.insertFragments(documentId, operations);
  }

  private async insertFragments(
    documentId: string,
    operations: readonly Operation[],
  ): Promise<Operation[]> {
    for (const incoming of operations) {
      const operation = structuredClone(incoming);
      const signerKey = operation.action.context?.signer?.app.key;
      if (!signerKey)
        throw new AuthBootstrapError(
          "invalid-bootstrap",
          "Staged creation fragments require a verified signing key.",
        );
      if (operation.action.context) delete operation.action.context.initialAuth;
      await this.db
        .insertInto("InitialAuthInbox")
        .values({
          documentId,
          actionId: operation.action.id,
          signerKey,
          operation: JSON.stringify(operation),
        })
        .onConflict((conflict) =>
          conflict.columns(["documentId", "actionId", "signerKey"]).doNothing(),
        )
        .execute();
      const stored = await this.db
        .selectFrom("InitialAuthInbox")
        .select("operation")
        .where("documentId", "=", documentId)
        .where("actionId", "=", operation.action.id)
        .where("signerKey", "=", signerKey)
        .executeTakeFirstOrThrow();
      if (
        initialAuthDigest(stored.operation.action) !==
        initialAuthDigest(operation.action)
      )
        throw new AuthBootstrapError(
          "invalid-bootstrap",
          "A staged bootstrap action was received with different contents from the same signing key.",
        );
      await this.db
        .updateTable("InitialAuthInbox")
        .set({ operation: JSON.stringify(operation) })
        .where("documentId", "=", documentId)
        .where("actionId", "=", operation.action.id)
        .where("signerKey", "=", signerKey)
        .execute();
    }
    const rows = await this.db
      .selectFrom("InitialAuthInbox")
      .select("operation")
      .where("documentId", "=", documentId)
      .execute();
    const creation = rows.find(
      (row) => row.operation.action.type === "CREATE_DOCUMENT",
    );
    let retained = rows;
    let prefixIds: readonly string[] = [];
    if (creation) {
      const input = creation.operation.action.input;
      if (
        typeof input !== "object" ||
        input === null ||
        !("initialAuth" in input)
      )
        throw new AuthBootstrapError(
          "invalid-bootstrap",
          "A staged creation must declare its initializer.",
        );
      const commitment = parseInitialAuthCommitment(input.initialAuth);
      prefixIds = commitment.actionIds;
      await this.db
        .deleteFrom("InitialAuthInbox")
        .where("documentId", "=", documentId)
        .where("actionId", "in", [...commitment.actionIds])
        .where("signerKey", "!=", commitment.initializerKey)
        .execute();
      retained = rows.filter(
        ({ operation }) =>
          !commitment.actionIds.includes(operation.action.id) ||
          operation.action.context?.signer?.app.key ===
            commitment.initializerKey,
      );
    }
    if (
      retained.filter(
        ({ operation }) => !prefixIds.includes(operation.action.id),
      ).length > 1000
    )
      throw new AuthBootstrapError(
        "invalid-bootstrap",
        "A bootstrap inbox cannot exceed 1000 pending operations per document.",
      );
    return retained.map((row) => row.operation);
  }

  private async assertLive(documentId: string) {
    if (!this.db.isTransaction)
      throw new Error("An initial authorization write requires a transaction.");
    await acquirePurgeLocks(
      this.db as Transaction<Database>,
      [documentId],
      "exclusive",
    );
    if ((await findPurged(this.db, [documentId])).has(documentId))
      throw new AuthBootstrapError(
        "invalid-bootstrap",
        "A purged document cannot retain or replay creation payloads.",
      );
  }
}
