import type {
  DatabaseConnection,
  DatabaseIntrospector,
  Dialect,
  DialectAdapter,
  Driver,
  Kysely,
  QueryCompiler,
  QueryResult,
  TransactionSettings,
} from "kysely";
import { CompiledQuery } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";

/**
 * The PGlite surface this dialect needs. Declared structurally so a consumer
 * can pass any PGlite build (or a worker proxy over one) without the import
 * pulling the wasm bundle into this module.
 */
export type PGliteSession = {
  query: (
    sql: string,
    params?: unknown[],
  ) => Promise<{ rows: unknown[]; affectedRows?: number }>;
  /**
   * Simple-query execution. Used for the commit guard and for session
   * recovery, both of which need a statement path that is independent of the
   * extended-protocol one every other statement takes.
   */
  exec: (sql: string) => Promise<unknown>;
  /** Whether a transaction is open on the session, per the command tags seen. */
  isInTransaction: () => boolean;
};

export type HardenedPGliteDialectOptions = {
  /**
   * How long a queued `acquireConnection` waits for the single PGlite lease
   * before failing with {@link PGliteAcquireTimeoutError}. A nested
   * acquisition - a recovery path querying the base handle from inside a
   * transaction, or an abandoned `stream()` iterator that never releases -
   * otherwise parks forever and takes the whole reactor with it. The default
   * is generous because a legitimate bulk-ingestion transaction may hold the
   * lease for a long time; the point is to bound the wait, not to police it.
   */
  acquireTimeoutMs: number;
  /** Where unrecoverable session faults and swallowed rollbacks are reported. */
  onDiagnostic: (message: string, error?: unknown) => void;
  /**
   * Invoked when a session is found unrecoverable - the point at which this
   * dialect would otherwise throw {@link PGliteSessionPoisonedError}. A holder
   * that can recreate the PGlite instance (see `SelfHealingPGliteClient`) wires
   * this to do so and returns whether the session is now usable. Returning
   * `true` makes the current acquisition re-probe and proceed against the fresh
   * session instead of throwing, so the operation that hit the poison completes
   * once the instance is swapped. The default returns `false`, preserving the
   * loud refusal for holders that cannot self-heal.
   */
  onPoisoned: (cause: unknown) => Promise<boolean>;
};

export const DEFAULT_ACQUIRE_TIMEOUT_MS = 120_000;

/**
 * A guard statement in front of COMMIT, in one simple-query batch.
 *
 * Postgres answers COMMIT on an aborted transaction with a ROLLBACK command
 * tag and no error, and Kysely never inspects the tag - so
 * `transaction().execute()` resolves with the callback's value while nothing
 * was written, the job is reported COMPLETED and the sync cursor advances past
 * data that does not exist. PGlite's `Results` does not carry the command tag
 * either, so the degraded COMMIT is forestalled rather than detected: the
 * backend runs both statements of one Query message back to back, so in an
 * aborted transaction the guard raises and the COMMIT is never reached, and in
 * a healthy one the COMMIT is a real commit. Nothing can interleave between
 * them.
 */
const COMMIT_WITH_GUARD = "select 1 as __commit_guard; commit";

const PROBE = "select 1 as __session_probe";

const ABORTED_TRANSACTION_CODE = "25P02";

/** Kysely's own parameter type for `createIntrospector`, which is untyped. */
type IntrospectedDatabase = Parameters<Dialect["createIntrospector"]>[0];

export class PGliteSessionError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "PGliteSessionError";
  }
}

/** The single PGlite lease was never handed over within the bound. */
export class PGliteAcquireTimeoutError extends PGliteSessionError {
  constructor(timeoutMs: number) {
    super(
      `Timed out after ${timeoutMs}ms waiting for the PGlite connection. The single session is held by a statement that never completed: a transaction awaiting a nested query on the base handle, or an abandoned stream iterator.`,
    );
    this.name = "PGliteAcquireTimeoutError";
  }
}

/** COMMIT would have been answered with a ROLLBACK tag. */
export class PGliteAbortedTransactionError extends PGliteSessionError {
  constructor(cause: unknown) {
    super(
      `Refusing to report a commit for an aborted transaction: COMMIT would have been answered with a ROLLBACK tag and nothing written. Underlying error: ${errorOf(cause).message}`,
      cause,
    );
    this.name = "PGliteAbortedTransactionError";
  }
}

/**
 * The session is in a state no statement can clear. A stuck `PORTAL_ACTIVE`
 * unnamed portal is the known case: every message PGlite sends binds the
 * unnamed portal, and both `exec_bind_message` and a portal `Close` drop it
 * through `PortalDrop`, which refuses while the portal is active. There is no
 * SQL or protocol cure - only restarting the component that owns the session -
 * so the honest response is to fail loudly, naming the original error, rather
 * than hand the dead session to the next caller.
 */
export class PGliteSessionPoisonedError extends PGliteSessionError {
  constructor(cause: unknown) {
    super(
      `The PGlite session is unrecoverable and cannot be reused; the component owning it must be restarted. Original error: ${errorOf(cause).message}`,
      cause,
    );
    this.name = "PGliteSessionPoisonedError";
  }
}

function errorOf(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function isAbortedTransactionError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === ABORTED_TRANSACTION_CODE) {
    return true;
  }
  return errorOf(error).message.includes("current transaction is aborted");
}

/**
 * The reactor's Kysely dialect over PGlite.
 *
 * It wraps `kysely-pglite-dialect` rather than replacing it - the adapter,
 * compiler and introspector are upstream's, and so is the connection and its
 * serialising queue - and adds the four guarantees a single shared session
 * needs, each of which the live brick of
 * docs/bugs/2026-10-03-pglite-aborted-transaction-bricks-worker-reactor.md
 * went through:
 *
 *  1. A COMMIT that would be answered with a ROLLBACK tag rejects instead of
 *     resolving, so a job can never report success for a transaction that
 *     wrote nothing (mechanisms A and B).
 *  2. A failed ROLLBACK no longer replaces the failure that caused it, so the
 *     real cause reaches the logs (amplifier A-2.1).
 *  3. A connection whose statements failed is probed before reuse and the
 *     session rolled back if it is in an aborted transaction, instead of being
 *     handed on untouched (amplifiers A-2.2 and A-2.3).
 *  4. `acquireConnection` is bounded, so a parked waiter fails with a
 *     diagnostic instead of hanging forever (mechanism A-1).
 */
export class HardenedPGliteDialect implements Dialect {
  private readonly inner: PGliteDialect;
  private readonly options: HardenedPGliteDialectOptions;

  constructor(
    private readonly client: PGliteSession,
    options: Partial<HardenedPGliteDialectOptions> = {},
  ) {
    this.inner = new PGliteDialect(client as never);
    this.options = {
      acquireTimeoutMs: options.acquireTimeoutMs ?? DEFAULT_ACQUIRE_TIMEOUT_MS,
      onDiagnostic:
        options.onDiagnostic ??
        ((message, error) => {
          console.error(`[pglite-dialect] ${message}`, error);
        }),
      onPoisoned: options.onPoisoned ?? (() => Promise.resolve(false)),
    };
  }

  createAdapter(): DialectAdapter {
    return this.inner.createAdapter();
  }

  createDriver(): Driver {
    return new HardenedPGliteDriver(
      this.inner.createDriver(),
      this.client,
      this.options,
    );
  }

  createQueryCompiler(): QueryCompiler {
    return this.inner.createQueryCompiler();
  }

  createIntrospector(db: IntrospectedDatabase): DatabaseIntrospector {
    return this.inner.createIntrospector(db);
  }
}

/** Per-acquisition bookkeeping; a new one is made for every acquire. */
class HardenedPGliteConnection implements DatabaseConnection {
  /** The last error a statement on this connection raised. */
  failure: Error | undefined = undefined;
  /** Set when `rollbackTransaction` itself failed. */
  rollbackFailure: Error | undefined = undefined;
  /** True between a successful BEGIN and its COMMIT or ROLLBACK. */
  transactionOpen = false;

  constructor(readonly inner: DatabaseConnection) {}

  /**
   * A failed statement is never re-run, only recorded: the failure marks the
   * connection suspect, and `releaseConnection` resets the session so the next
   * caller gets a usable one instead of the same error forever. That is what
   * clears the self-perpetuating poison - not a retry.
   *
   * It used to retry a statement that failed with `25P02` once the session had
   * been reset, gated on `this.transactionOpen`. That gate is not knowledge:
   * it is only set by this driver's own `beginTransaction`, while arbitrary SQL
   * reaches the same session through the dialect queue and can open a
   * transaction with a raw `BEGIN`. A statement failing inside such a
   * transaction therefore passed the gate, the recovery rolled the transaction
   * back, and the statement was replayed STANDALONE in autocommit - a write
   * meant to be atomic with its transaction committing alone, which is worse
   * than the error it was papering over. PGlite offers no way to learn whose
   * transaction the session is in, so the only sound answer is not to retry.
   */
  async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
    try {
      return await this.inner.executeQuery<R>(compiledQuery);
    } catch (error) {
      this.failure = errorOf(error);
      throw error;
    }
  }

  streamQuery<R>(
    compiledQuery: CompiledQuery,
    chunkSize?: number,
  ): AsyncIterableIterator<QueryResult<R>> {
    return this.inner.streamQuery<R>(compiledQuery, chunkSize);
  }

  /** The session is suspect and must be probed before it is handed on. */
  get suspect(): boolean {
    return (
      this.failure !== undefined ||
      this.rollbackFailure !== undefined ||
      this.transactionOpen
    );
  }
}

class HardenedPGliteDriver implements Driver {
  /**
   * The error that left the session unrecoverable, when release-time recovery
   * could not clear it. Retried once per acquisition so a session that becomes
   * clearable later heals itself.
   */
  private sessionFault: Error | undefined = undefined;

  constructor(
    private readonly inner: Driver,
    private readonly client: PGliteSession,
    private readonly options: HardenedPGliteDialectOptions,
  ) {}

  async init(): Promise<void> {
    await this.inner.init();
  }

  /**
   * Hands out the single lease, recovering a faulted session first. When
   * release-time recovery could not clear the fault, the last resort is to ask
   * the holder to recreate the PGlite instance - the one thing that clears a
   * stuck portal. If it does, the swapped-in session is healthy, so re-probe and
   * proceed against it instead of throwing; otherwise the session is refused
   * with {@link PGliteSessionPoisonedError}.
   */
  async acquireConnection(): Promise<DatabaseConnection> {
    const innerConnection = await this.acquireWithTimeout();

    if (this.sessionFault !== undefined) {
      const fault = this.sessionFault;
      let recovered = await this.recoverSession(false);
      if (!recovered) {
        const healed = await this.options.onPoisoned(fault);
        if (healed) {
          recovered = await this.recoverSession(false);
        }
      }
      if (!recovered) {
        await this.inner.releaseConnection(innerConnection);
        throw new PGliteSessionPoisonedError(fault);
      }
      this.sessionFault = undefined;
    }

    return new HardenedPGliteConnection(innerConnection);
  }

  async beginTransaction(
    connection: DatabaseConnection,
    settings: TransactionSettings,
  ): Promise<void> {
    const wrapper = asWrapper(connection);
    try {
      await this.inner.beginTransaction(wrapper.inner, settings);
    } catch (error) {
      wrapper.failure = errorOf(error);
      if (!isAbortedTransactionError(error)) {
        throw error;
      }
      if (!(await this.recoverSession(false))) {
        this.sessionFault = errorOf(error);
        throw error;
      }
      await this.inner.beginTransaction(wrapper.inner, settings);
      wrapper.failure = undefined;
    }
    wrapper.transactionOpen = true;
  }

  async commitTransaction(connection: DatabaseConnection): Promise<void> {
    const wrapper = asWrapper(connection);
    try {
      await this.client.exec(COMMIT_WITH_GUARD);
    } catch (error) {
      wrapper.failure = errorOf(error);
      if (isAbortedTransactionError(error)) {
        throw new PGliteAbortedTransactionError(error);
      }
      throw error;
    }
    wrapper.transactionOpen = false;
    wrapper.failure = undefined;
  }

  async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    const wrapper = asWrapper(connection);
    try {
      await this.inner.rollbackTransaction(wrapper.inner);
      wrapper.transactionOpen = false;
    } catch (error) {
      // Kysely rethrows whatever rollbackTransaction raises, which replaces
      // the failure that caused the rollback - the real cause then never
      // reaches the logs, which is why the live worker was silent. Record it
      // and return: releaseConnection recovers the session, and the original
      // error is what propagates to the caller.
      wrapper.rollbackFailure = errorOf(error);
      this.options.onDiagnostic(
        "rollback failed; preserving the original failure and recovering the session on release",
        error,
      );
    }
  }

  async releaseConnection(connection: DatabaseConnection): Promise<void> {
    const wrapper = asWrapper(connection);

    if (wrapper.suspect) {
      const recovered = await this.recoverSession(wrapper.transactionOpen);
      if (!recovered) {
        this.sessionFault =
          wrapper.rollbackFailure ??
          wrapper.failure ??
          new Error("session left in a transaction");
        this.options.onDiagnostic(
          "the PGlite session could not be reset and is being marked unrecoverable",
          this.sessionFault,
        );
      }
    }

    await this.inner.releaseConnection(wrapper.inner);
  }

  async destroy(): Promise<void> {
    await this.inner.destroy();
  }

  /**
   * Races upstream's queue against the configured bound. A waiter that gives
   * up still hands the lease on when it eventually arrives, so abandoning it
   * cannot wedge the queue behind an owner that is no longer listening.
   */
  private async acquireWithTimeout(): Promise<DatabaseConnection> {
    const timeoutMs = this.options.acquireTimeoutMs;
    if (timeoutMs <= 0) {
      return this.inner.acquireConnection();
    }

    let abandoned = false;
    const pending = this.inner.acquireConnection().then((connection) => {
      if (!abandoned) {
        return connection;
      }
      void this.inner.releaseConnection(connection).catch(() => undefined);
      throw new PGliteAcquireTimeoutError(timeoutMs);
    });

    let handle: ReturnType<typeof setTimeout> | undefined;
    const expiry = new Promise<never>((_resolve, reject) => {
      handle = setTimeout(() => {
        abandoned = true;
        reject(new PGliteAcquireTimeoutError(timeoutMs));
      }, timeoutMs);
    });

    try {
      return await Promise.race([pending, expiry]);
    } finally {
      clearTimeout(handle);
    }
  }

  /**
   * Resets the session so the next caller gets a usable one, and answers
   * whether that worked.
   *
   * `mustEndTransaction` is set when this driver's own Kysely transaction is
   * still open at release - a rollback that failed, or a transaction left
   * behind - and the rollback is then unconditional. Otherwise the session is
   * probed first and only rolled back when the probe says it is in an aborted
   * transaction, so a healthy transaction belonging to another consumer of the
   * same session is never ended from underneath it.
   *
   * The rollback goes through `exec`, the simple-query path, rather than the
   * extended-protocol path every other statement takes - the one SQL-level
   * difference available, and what the analysis proposes.
   */
  private async recoverSession(mustEndTransaction: boolean): Promise<boolean> {
    if (
      !mustEndTransaction &&
      !this.client.isInTransaction() &&
      (await this.probeSession())
    ) {
      return true;
    }

    try {
      await this.client.exec("rollback");
    } catch (error) {
      this.options.onDiagnostic("session rollback failed", error);
    }

    if (!(await this.probeSession())) {
      return false;
    }
    return !this.client.isInTransaction();
  }

  private async probeSession(): Promise<boolean> {
    try {
      await this.client.exec(PROBE);
      return true;
    } catch {
      return false;
    }
  }
}

function asWrapper(connection: DatabaseConnection): HardenedPGliteConnection {
  if (!(connection instanceof HardenedPGliteConnection)) {
    throw new PGliteSessionError(
      "Connection was not created by HardenedPGliteDialect",
    );
  }
  return connection;
}

/**
 * Runs raw SQL through a Kysely instance so it enters the dialect's serialising
 * queue, instead of being issued straight at the PGlite client. A statement
 * that bypasses the queue lands inside whatever transaction is open on the
 * shared session - reading its uncommitted rows, or aborting it outright, which
 * is how an inspector typo could silently erase a job's writes (mechanism A-3).
 */
export async function queryThroughDialect<DB>(
  db: Kysely<DB>,
  sql: string,
  params?: unknown[],
): Promise<unknown[]> {
  const result = await db.executeQuery<unknown>(
    CompiledQuery.raw(sql, params ?? []),
  );
  return [...result.rows];
}
