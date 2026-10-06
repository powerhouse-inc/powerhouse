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

/** Structural so importing this module does not pull in the PGlite wasm bundle. */
export type PGliteSession = {
  query: (
    sql: string,
    params?: unknown[],
  ) => Promise<{ rows: unknown[]; affectedRows?: number }>;
  /** Simple-query execution, used for the commit guard and session recovery. */
  exec: (sql: string) => Promise<unknown>;
  isInTransaction: () => boolean;
};

export type HardenedPGliteDialectOptions = {
  /** Opt-in bound on waiting for the single PGlite lease; 0 (the default) waits indefinitely. */
  acquireTimeoutMs: number;
  /** Bound on one statement that neither resolves nor rejects (a dead wasm call); 0 disables it. */
  statementTimeoutMs: number;
  /** The bound for {@link isLongRunningStatement} statements, whose runtime scales with the data. */
  longStatementTimeoutMs: number;
  /** Bound on each session recovery statement, which runs against the session that just failed. */
  recoveryTimeoutMs: number;
  /** Where unrecoverable session faults and swallowed rollbacks are reported. */
  onDiagnostic: (message: string, error?: unknown) => void;
};

export const DEFAULT_STATEMENT_TIMEOUT_MS = 120_000;

export const DEFAULT_LONG_STATEMENT_TIMEOUT_MS = 900_000;

export const DEFAULT_RECOVERY_TIMEOUT_MS = 15_000;

const LONG_STATEMENT_PREFIXES = [
  "vacuum",
  "analyze",
  "reindex",
  "cluster",
  "checkpoint",
  "copy",
  "alter ",
  "create ",
  "drop ",
  "truncate",
  "refresh ",
];

/** Maintenance and DDL, matched on the leading keyword of the compiled SQL. */
export function isLongRunningStatement(statement: string): boolean {
  const normalized = statement.trimStart().toLowerCase();
  return LONG_STATEMENT_PREFIXES.some((prefix) =>
    normalized.startsWith(prefix),
  );
}

function summarize(statement: string): string {
  const collapsed = statement.replace(/\s+/g, " ").trim();
  return collapsed.length > 160 ? `${collapsed.slice(0, 160)}...` : collapsed;
}

/** COMMIT in an aborted transaction silently rolls back; the guard raises first. */
const COMMIT_WITH_GUARD = "select 1 as __commit_guard; commit";

const PROBE = "select 1 as __session_probe";

const ABORTED_TRANSACTION_CODE = "25P02";

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

export class PGliteAcquireTimeoutError extends PGliteSessionError {
  constructor(timeoutMs: number) {
    super(
      `Timed out after ${timeoutMs}ms waiting for the PGlite connection. The single session is held by a statement that never completed: a transaction awaiting a nested query on the base handle, or an abandoned stream iterator.`,
    );
    this.name = "PGliteAcquireTimeoutError";
  }
}

/** The call cannot be aborted, so it is abandoned and the session treated as poisoned. */
export class PGliteStatementTimeoutError extends PGliteSessionError {
  constructor(timeoutMs: number, statement: string) {
    super(
      `A PGlite statement neither resolved nor rejected within ${timeoutMs}ms, so its wasm call is presumed dead and the session poisoned: ${summarize(statement)}`,
    );
    this.name = "PGliteStatementTimeoutError";
  }
}

export class PGliteAbortedTransactionError extends PGliteSessionError {
  constructor(cause: unknown) {
    super(
      `Refusing to report a commit for an aborted transaction: COMMIT would have been answered with a ROLLBACK tag and nothing written. Underlying error: ${errorOf(cause).message}`,
      cause,
    );
    this.name = "PGliteAbortedTransactionError";
  }
}

/** No statement can clear the session (e.g. a stuck active portal). */
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

const TIMED_OUT = Symbol("pglite-deadline-expired");

/** Races a call that cannot be cancelled; on {@link TIMED_OUT} the call may still settle later. */
async function withDeadline<T>(
  pending: Promise<T>,
  timeoutMs: number,
): Promise<T | typeof TIMED_OUT> {
  let handle: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<typeof TIMED_OUT>((resolve) => {
    handle = setTimeout(() => resolve(TIMED_OUT), timeoutMs);
  });
  try {
    return await Promise.race([pending, expiry]);
  } finally {
    clearTimeout(handle);
  }
}

/** The part of the driver a connection needs to run and record bounded statements. */
type StatementGuard = {
  /** Bumped each time a hung statement is escalated. */
  readonly generation: number;
  runStatement<T>(statement: string, execute: () => Promise<T>): Promise<T>;
  recordFailure(
    connection: HardenedPGliteConnection,
    generation: number,
    error: unknown,
  ): void;
};

function isAbortedTransactionError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === ABORTED_TRANSACTION_CODE) {
    return true;
  }
  return errorOf(error).message.includes("current transaction is aborted");
}

/** `kysely-pglite-dialect` hardened for one shared session that a fault must not brick. */
export class HardenedPGliteDialect implements Dialect {
  private readonly inner: PGliteDialect;
  private readonly options: HardenedPGliteDialectOptions;

  constructor(
    private readonly client: PGliteSession,
    options: Partial<HardenedPGliteDialectOptions> = {},
  ) {
    this.inner = new PGliteDialect(client as never);
    this.options = {
      acquireTimeoutMs: options.acquireTimeoutMs ?? 0,
      statementTimeoutMs:
        options.statementTimeoutMs ?? DEFAULT_STATEMENT_TIMEOUT_MS,
      longStatementTimeoutMs:
        options.longStatementTimeoutMs ?? DEFAULT_LONG_STATEMENT_TIMEOUT_MS,
      recoveryTimeoutMs:
        options.recoveryTimeoutMs ?? DEFAULT_RECOVERY_TIMEOUT_MS,
      onDiagnostic:
        options.onDiagnostic ??
        ((message, error) => {
          console.error(`[pglite-dialect] ${message}`, error);
        }),
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

class HardenedPGliteConnection implements DatabaseConnection {
  failure: Error | undefined = undefined;
  rollbackFailure: Error | undefined = undefined;
  transactionOpen = false;

  constructor(
    readonly inner: DatabaseConnection,
    private readonly guard: StatementGuard,
  ) {}

  /** Never retried: a replay could commit alone a write meant for another consumer's transaction. */
  async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
    const generation = this.guard.generation;
    try {
      return await this.guard.runStatement(compiledQuery.sql, () =>
        this.inner.executeQuery<R>(compiledQuery),
      );
    } catch (error) {
      this.guard.recordFailure(this, generation, error);
      throw error;
    }
  }

  streamQuery<R>(
    compiledQuery: CompiledQuery,
    chunkSize?: number,
  ): AsyncIterableIterator<QueryResult<R>> {
    const inner = this.inner.streamQuery<R>(compiledQuery, chunkSize);
    return this.deadlinedStream(compiledQuery, inner);
  }

  /** Upstream issues the whole query on the first pull, so each pull is bounded like a statement. */
  private async *deadlinedStream<R>(
    compiledQuery: CompiledQuery,
    inner: AsyncIterableIterator<QueryResult<R>>,
  ): AsyncIterableIterator<QueryResult<R>> {
    for (;;) {
      const generation = this.guard.generation;
      let next: IteratorResult<QueryResult<R>>;
      try {
        next = await this.guard.runStatement(compiledQuery.sql, () =>
          inner.next(),
        );
      } catch (error) {
        this.guard.recordFailure(this, generation, error);
        throw error;
      }
      if (next.done === true) {
        return;
      }
      yield next.value;
    }
  }

  get suspect(): boolean {
    return (
      this.failure !== undefined ||
      this.rollbackFailure !== undefined ||
      this.transactionOpen
    );
  }
}

class HardenedPGliteDriver implements Driver, StatementGuard {
  /** Set when release could not reset the session; each acquire retries the reset. */
  private sessionFault: Error | undefined = undefined;
  /** Lets an abandoned call's late settlement be told apart from current failures. */
  private statementGeneration = 0;

  constructor(
    private readonly inner: Driver,
    private readonly client: PGliteSession,
    private readonly options: HardenedPGliteDialectOptions,
  ) {}

  get generation(): number {
    return this.statementGeneration;
  }

  /** Bounds one statement; an expiry is escalated as a poisoned session. */
  async runStatement<T>(
    statement: string,
    execute: () => Promise<T>,
  ): Promise<T> {
    const timeoutMs = this.timeoutFor(statement);
    if (timeoutMs <= 0) {
      return execute();
    }

    const generation = this.statementGeneration;
    const outcome = await withDeadline(execute(), timeoutMs);
    if (outcome !== TIMED_OUT) {
      return outcome;
    }

    throw this.escalateHungStatement(
      new PGliteStatementTimeoutError(timeoutMs, statement),
      generation,
    );
  }

  recordFailure(
    connection: HardenedPGliteConnection,
    generation: number,
    error: unknown,
  ): void {
    if (generation === this.statementGeneration) {
      connection.failure = errorOf(error);
    }
  }

  async init(): Promise<void> {
    await this.inner.init();
  }

  async acquireConnection(): Promise<DatabaseConnection> {
    const innerConnection = await this.acquireWithTimeout();

    if (this.sessionFault !== undefined) {
      const fault = this.sessionFault;
      const recovered = await this.recoverSession(false);
      if (!recovered) {
        await this.inner.releaseConnection(innerConnection);
        throw new PGliteSessionPoisonedError(fault);
      }
      this.sessionFault = undefined;
    }

    return new HardenedPGliteConnection(innerConnection, this);
  }

  /** Kysely never rolls back after a failed BEGIN, so an aborted session is reset here. */
  async beginTransaction(
    connection: DatabaseConnection,
    settings: TransactionSettings,
  ): Promise<void> {
    const wrapper = asWrapper(connection);
    const generation = this.statementGeneration;
    try {
      await this.runStatement("begin", () =>
        this.inner.beginTransaction(wrapper.inner, settings),
      );
    } catch (error) {
      this.recordFailure(wrapper, generation, error);
      if (!isAbortedTransactionError(error)) {
        throw error;
      }
      if (!(await this.recoverSession(false))) {
        this.sessionFault = errorOf(error);
        throw error;
      }
      const retryGeneration = this.statementGeneration;
      try {
        await this.runStatement("begin", () =>
          this.inner.beginTransaction(wrapper.inner, settings),
        );
      } catch (retryError) {
        this.recordFailure(wrapper, retryGeneration, retryError);
        throw retryError;
      }
      wrapper.failure = undefined;
    }
    wrapper.transactionOpen = true;
  }

  async commitTransaction(connection: DatabaseConnection): Promise<void> {
    const wrapper = asWrapper(connection);
    const generation = this.statementGeneration;
    try {
      await this.runStatement(COMMIT_WITH_GUARD, () =>
        this.client.exec(COMMIT_WITH_GUARD),
      );
    } catch (error) {
      this.recordFailure(wrapper, generation, error);
      if (isAbortedTransactionError(error)) {
        throw new PGliteAbortedTransactionError(error);
      }
      throw error;
    }
    wrapper.transactionOpen = false;
    wrapper.failure = undefined;
  }

  /** Swallowed so the original failure propagates; release resets the session. */
  async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    const wrapper = asWrapper(connection);
    const generation = this.statementGeneration;
    try {
      await this.runStatement("rollback", () =>
        this.inner.rollbackTransaction(wrapper.inner),
      );
      wrapper.transactionOpen = false;
    } catch (error) {
      if (generation === this.statementGeneration) {
        wrapper.rollbackFailure = errorOf(error);
      }
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

  private timeoutFor(statement: string): number {
    return isLongRunningStatement(statement)
      ? this.options.longStatementTimeoutMs
      : this.options.statementTimeoutMs;
  }

  /** Marks the session faulted once per generation; a stale expiry reports only itself. */
  private escalateHungStatement(
    cause: PGliteStatementTimeoutError,
    generation: number,
  ): Error {
    if (generation !== this.statementGeneration) {
      return cause;
    }

    this.statementGeneration += 1;
    this.sessionFault = cause;
    this.options.onDiagnostic(
      "a PGlite statement never settled within its deadline; treating the session as poisoned",
      cause,
    );
    return new PGliteSessionPoisonedError(cause);
  }

  /** A waiter that gave up still passes the lease on, so it cannot wedge the queue. */
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

  /** Rolls back only when told to or when the probe fails, sparing another consumer's live transaction. */
  private async recoverSession(mustEndTransaction: boolean): Promise<boolean> {
    if (
      !mustEndTransaction &&
      !this.client.isInTransaction() &&
      (await this.probeSession())
    ) {
      return true;
    }

    if (!(await this.recoveryExec("rollback"))) {
      this.options.onDiagnostic(
        "session rollback did not complete; the session stays suspect",
      );
    }

    if (!(await this.probeSession())) {
      return false;
    }
    return !this.client.isInTransaction();
  }

  private async probeSession(): Promise<boolean> {
    return this.recoveryExec(PROBE);
  }

  /** Kysely awaits release, so an unbounded recovery statement would hold the lease forever. */
  private async recoveryExec(statement: string): Promise<boolean> {
    const timeoutMs = this.options.recoveryTimeoutMs;
    const pending = this.client.exec(statement).then(
      () => true,
      (error: unknown) => {
        this.options.onDiagnostic("recovery statement failed", error);
        return false;
      },
    );
    if (timeoutMs <= 0) {
      return pending;
    }

    const outcome = await withDeadline(pending, timeoutMs);
    if (outcome === TIMED_OUT) {
      this.options.onDiagnostic(
        `a PGlite recovery statement did not settle within ${timeoutMs}ms; the session is unrecoverable from SQL`,
      );
      return false;
    }
    return outcome;
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

/** Raw SQL through the dialect's queue, instead of into whatever transaction holds the session. */
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
