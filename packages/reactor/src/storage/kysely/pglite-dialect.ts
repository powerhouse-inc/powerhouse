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
  /**
   * How long a single statement may neither resolve nor reject before the
   * session is presumed dead. A PGlite statement whose wasm internals die
   * mid-call raises NO error and never settles: the lease is never released,
   * `acquireTimeoutMs` bounds only the WAITERS and not the holder, and the
   * self-heal needs an error to trigger - so the whole reactor wedges in
   * silence (regression run 3, finding B). The deadline turns that into the
   * poison path. It is per STATEMENT, not per transaction, so a bulk
   * transaction holding the lease for an hour is unaffected as long as each of
   * its statements settles; see {@link longStatementTimeoutMs} for the
   * individually long ones. Set to 0 to disable.
   */
  statementTimeoutMs: number;
  /**
   * The deadline for a statement {@link isLongRunningStatement} recognises -
   * maintenance and DDL, whose duration is a function of the data rather than
   * of liveness. Generous enough that a vacuum or an index build on a large
   * store is never mistaken for a dead wasm call.
   */
  longStatementTimeoutMs: number;
  /**
   * How long the release-time and acquire-time session recovery may take. The
   * recovery runs `exec` against the same session that just failed, so it can
   * hang exactly like the statement that poisoned it - and because Kysely
   * awaits `releaseConnection`, a hung recovery holds the lease forever and
   * relocates the silent wedge rather than curing it. A recovery that passes
   * this bound counts as failed, which marks the session unrecoverable and
   * escalates on the next acquisition.
   */
  recoveryTimeoutMs: number;
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
 * Two minutes. A healthy PGlite statement in this reactor is milliseconds to
 * low seconds even under the durable-flush-per-statement posture that caps
 * bulk catch-up at ~2 ops/sec; two orders of magnitude of headroom on top of
 * that is still far below the operator-visible wedge the deadline exists to
 * break. The deadline is per statement, so a long TRANSACTION (bulk ingestion,
 * a migration batch) is not bounded by it.
 */
export const DEFAULT_STATEMENT_TIMEOUT_MS = 120_000;

/** Fifteen minutes, for the data-sized statements of {@link isLongRunningStatement}. */
export const DEFAULT_LONG_STATEMENT_TIMEOUT_MS = 900_000;

export const DEFAULT_RECOVERY_TIMEOUT_MS = 15_000;

/**
 * Statement kinds whose runtime scales with the data rather than reflecting
 * liveness, and which therefore get {@link
 * HardenedPGliteDialectOptions.longStatementTimeoutMs}. Matching is on the
 * leading keyword of the compiled SQL, which is what Kysely hands the driver.
 */
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

/** Whether a statement is one of the data-sized kinds, not a liveness probe. */
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

/**
 * A statement neither resolved nor rejected within its deadline.
 *
 * The wasm call cannot be aborted, so the call is abandoned rather than
 * cancelled: its late settlement is discarded by the generation guard in
 * {@link HardenedPGliteDriver}. The session is treated as poisoned, because a
 * statement that never settles has left the protocol stream in an unknown
 * state and the only cure is a fresh instance.
 */
export class PGliteStatementTimeoutError extends PGliteSessionError {
  constructor(timeoutMs: number, statement: string) {
    super(
      `A PGlite statement neither resolved nor rejected within ${timeoutMs}ms, so its wasm call is presumed dead and the session poisoned: ${summarize(statement)}`,
    );
    this.name = "PGliteStatementTimeoutError";
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

/** Resolved by {@link withDeadline} when the bound won the race. */
const TIMED_OUT = Symbol("pglite-deadline-expired");

/**
 * Races a promise that cannot be cancelled against a bound.
 *
 * A wasm call has no abort, so the loser is abandoned rather than cancelled:
 * a {@link TIMED_OUT} answer means the caller will never hear about that call
 * again and must assume it may still settle later, against an instance that by
 * then may have been replaced.
 */
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

/**
 * The statement-deadline surface a {@link HardenedPGliteConnection} needs from
 * its driver. Declared separately so the connection cannot reach the rest of
 * the driver's recovery state.
 */
type StatementGuard = {
  /** Bumped every time a hung statement is escalated; see the generation guard. */
  readonly generation: number;
  runStatement<T>(statement: string, execute: () => Promise<T>): Promise<T>;
};

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
 *  5. Every statement, transaction-control statement and recovery statement is
 *     bounded, so a wasm call that dies mid-flight and never settles - raising
 *     no error, holding the lease forever, invisible to a self-heal that needs
 *     an error - becomes a poison report and a recreate instead of a silent
 *     reactor-wide wedge (regression run 3, finding B).
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

  constructor(
    readonly inner: DatabaseConnection,
    private readonly guard: StatementGuard,
  ) {}

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
    const generation = this.guard.generation;
    try {
      return await this.guard.runStatement(compiledQuery.sql, () =>
        this.inner.executeQuery<R>(compiledQuery),
      );
    } catch (error) {
      // The generation guard: a statement whose deadline expired was escalated
      // into the poison path, which bumps the generation and may already have
      // replaced the instance. Recording a failure against this connection
      // would then make release-time recovery roll back a transaction
      // belonging to the FRESH session, so a bumped generation means the
      // failure is no longer this connection's to carry.
      if (generation === this.guard.generation) {
        this.failure = errorOf(error);
      }
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

  /**
   * Puts every `next()` of a streaming read under the statement deadline.
   * Upstream's `streamQuery` issues the whole query on the first pull, so an
   * unbounded pull is the same silent hang an unbounded `executeQuery` is.
   */
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
        if (generation === this.guard.generation) {
          this.failure = errorOf(error);
        }
        throw error;
      }
      if (next.done === true) {
        return;
      }
      yield next.value;
    }
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

class HardenedPGliteDriver implements Driver, StatementGuard {
  /**
   * The error that left the session unrecoverable, when release-time recovery
   * could not clear it. Retried once per acquisition so a session that becomes
   * clearable later heals itself.
   */
  private sessionFault: Error | undefined = undefined;
  /**
   * Bumped every time a hung statement is escalated. It identifies the session
   * incarnation a statement was issued against, so a call abandoned at its
   * deadline cannot write its late outcome into the state of the instance that
   * replaced it.
   */
  private statementGeneration = 0;
  /** In-flight poison escalation; collapses concurrent reports into one. */
  private escalation: Promise<boolean> | undefined = undefined;

  constructor(
    private readonly inner: Driver,
    private readonly client: PGliteSession,
    private readonly options: HardenedPGliteDialectOptions,
  ) {}

  get generation(): number {
    return this.statementGeneration;
  }

  /**
   * Runs one statement under its deadline and converts an expiry into the
   * poison path.
   *
   * The deadline is chosen per statement: maintenance and DDL get the long
   * bound because their runtime scales with the data, everything else the
   * short one. A long TRANSACTION is not bounded at all - the bound is on each
   * statement, so bulk ingestion holding the lease for an hour is fine as long
   * as its individual statements settle.
   *
   * On expiry the call is abandoned (a wasm call cannot be aborted), the
   * generation is bumped so its late settlement is ignored, and the session is
   * handed to the poison path exactly once. A successful self-heal still fails
   * THIS statement - its protocol exchange is lost - but with a usable session
   * behind it, so the job fails loudly and is retried instead of the reactor
   * going quiet.
   */
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

    throw await this.escalateHungStatement(
      new PGliteStatementTimeoutError(timeoutMs, statement),
      generation,
    );
  }

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
        const healed = await this.escalate(fault);
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

    return new HardenedPGliteConnection(innerConnection, this);
  }

  async beginTransaction(
    connection: DatabaseConnection,
    settings: TransactionSettings,
  ): Promise<void> {
    const wrapper = asWrapper(connection);
    try {
      await this.runStatement("begin", () =>
        this.inner.beginTransaction(wrapper.inner, settings),
      );
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
      await this.runStatement(COMMIT_WITH_GUARD, () =>
        this.client.exec(COMMIT_WITH_GUARD),
      );
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
      await this.runStatement("rollback", () =>
        this.inner.rollbackTransaction(wrapper.inner),
      );
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

  /** The bound for this statement; see {@link isLongRunningStatement}. */
  private timeoutFor(statement: string): number {
    return isLongRunningStatement(statement)
      ? this.options.longStatementTimeoutMs
      : this.options.statementTimeoutMs;
  }

  /**
   * Hands a hung statement to the poison path and answers what the caller
   * should throw.
   *
   * A statement issued against an older incarnation reports nothing: the
   * session it hung on has already been escalated and replaced, so its expiry
   * is stale news and only the original report may act.
   */
  private async escalateHungStatement(
    cause: PGliteStatementTimeoutError,
    generation: number,
  ): Promise<Error> {
    if (generation !== this.statementGeneration) {
      return cause;
    }

    this.statementGeneration += 1;
    this.sessionFault = cause;
    this.options.onDiagnostic(
      "a PGlite statement never settled within its deadline; treating the session as poisoned",
      cause,
    );

    const healed = await this.escalate(cause);
    if (!healed) {
      return new PGliteSessionPoisonedError(cause);
    }
    this.sessionFault = undefined;
    return cause;
  }

  /**
   * Reports the session poisoned, once. Concurrent reports - a hung statement
   * and a waiter acquiring behind it - share one `onPoisoned` call and its
   * answer, so the holder recreates the instance a single time. The recreate
   * itself runs outside the dialect (close and open on the PGlite instance,
   * under its own bound), so it is not subject to the statement deadline and
   * cannot recurse into it.
   */
  private escalate(cause: unknown): Promise<boolean> {
    this.escalation ??= this.options.onPoisoned(cause).finally(() => {
      this.escalation = undefined;
    });
    return this.escalation;
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

  /**
   * Runs one recovery statement under {@link
   * HardenedPGliteDialectOptions.recoveryTimeoutMs} and answers whether it
   * completed. Recovery goes at the same session that just failed, so it can
   * hang the same way - and since Kysely awaits `releaseConnection`, an
   * unbounded recovery would hold the lease forever and move the silent wedge
   * instead of curing it. A statement that neither answers nor errors within
   * the bound counts as a failed recovery, which is what marks the session
   * unrecoverable and escalates it on the next acquisition.
   */
  private async recoveryExec(statement: string): Promise<boolean> {
    const timeoutMs = this.options.recoveryTimeoutMs;
    const pending = this.client.exec(statement).then(
      () => true,
      (error: unknown) => {
        this.options.onDiagnostic(`recovery statement failed`, error);
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
