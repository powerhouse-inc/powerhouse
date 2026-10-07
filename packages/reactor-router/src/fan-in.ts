import type { PagedResults, PagingOptions } from "@powerhousedao/reactor";
import {
  FanInPartialFailureError,
  InvalidFanInCursorError,
  isOperationNotSupported,
  messageOf,
  rejectedWith,
  rethrow,
  type FanInExclusion,
} from "./errors.js";
import type { ReactorBackend, RouterDiagnostic } from "./types.js";

/**
 * Marks a cursor this router minted. A merged page's cursor cannot be one
 * backend's cursor -- it has to carry one per participating backend -- so it is
 * a router-owned string, and the prefix is what lets `find` tell a cursor it
 * issued from one a caller invented.
 */
export const FAN_IN_CURSOR_PREFIX = "router:v1:";

/** One backend's own cursor within a merged page. */
export type BackendCursor = {
  readonly backend: string;
  readonly cursor: string;
};

/** Whether the cursor is one this router minted. */
export function isFanInCursor(cursor: string): boolean {
  return cursor.startsWith(FAN_IN_CURSOR_PREFIX);
}

/**
 * The composite cursor for a merged page: the prefix plus each participating
 * backend's own cursor.
 *
 * Plain JSON rather than an opaque blob, deliberately. It is already an opaque
 * token to a caller (the prefix says whose it is), and a routing cursor that an
 * operator can read in a log line is worth more than four saved bytes when the
 * question is "which backend did this page stop on".
 */
export function encodeFanInCursor(cursors: readonly BackendCursor[]): string {
  return `${FAN_IN_CURSOR_PREFIX}${JSON.stringify(cursors)}`;
}

/** Reads back {@link encodeFanInCursor}; refuses anything malformed by name. */
export function decodeFanInCursor(cursor: string): readonly BackendCursor[] {
  if (!isFanInCursor(cursor)) {
    throw new InvalidFanInCursorError(cursor, "missing the router prefix");
  }
  const body = cursor.slice(FAN_IN_CURSOR_PREFIX.length);
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    throw new InvalidFanInCursorError(cursor, messageOf(error));
  }
  if (!Array.isArray(parsed)) {
    throw new InvalidFanInCursorError(cursor, "body is not an array");
  }
  const cursors: BackendCursor[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) {
      throw new InvalidFanInCursorError(cursor, "entry is not an object");
    }
    const candidate = entry as { backend?: unknown; cursor?: unknown };
    if (
      typeof candidate.backend !== "string" ||
      typeof candidate.cursor !== "string"
    ) {
      throw new InvalidFanInCursorError(
        cursor,
        "entry is missing a string backend or cursor",
      );
    }
    cursors.push({ backend: candidate.backend, cursor: candidate.cursor });
  }
  return cursors;
}

/**
 * How a fan-in treats a CAPABLE backend that fails at runtime.
 *
 * - `strict`: every CAPABLE backend must answer, and a genuine failure is
 *   raised as a {@link FanInPartialFailureError} carrying what did answer. For
 *   `find`, because a backend dropping out means documents are missing from the
 *   result with nothing in the result to say so.
 * - `tolerant`: a failure contributes nothing and is reported through
 *   `onDiagnostic`. For the reads whose subject legitimately does not exist on
 *   most backends -- a relationship read names a source document that only its
 *   owner holds, so every other backend SHOULD fail, and treating that as a
 *   partial result would make the operation impossible. If EVERY backend fails,
 *   the first failure is raised: an all-fail is not a tolerable silence.
 */
export type FanInMode = "strict" | "tolerant";

/**
 * Options for one fan-in, carrying the two decisions that are made PER READ.
 *
 * `tolerateNotSupported` is the one the shared fan-in must NOT decide on its
 * own: a backend that cannot serve the read by contract
 * ({@link ReactorOperationNotSupportedError}) is EXCLUDED from the union and
 * surfaced through `onDiagnostic` only when the CALLER opted in -- the case for
 * `find`, which legitimately unions whatever capable backends hold. For a read
 * whose answer would be confidently wrong if a backend were silently dropped,
 * the caller leaves this `false`, and a not-supported from any participating
 * backend fails loud (a {@link FanInPartialFailureError}) regardless of `mode`
 * and regardless of what the other backends answered. Lifting the decision to
 * the call site is what stops a boot fix for one read from corrupting every
 * other fan-in read (multi-reactor stage 4 review).
 */
export type FanInOptions = {
  readonly mode: FanInMode;
  readonly onDiagnostic: RouterDiagnostic;
  readonly tolerateNotSupported: boolean;
};

type Answer<T> = {
  readonly backend: ReactorBackend;
  readonly value: T;
};

type Failure = {
  readonly backend: string;
  readonly error: unknown;
};

/**
 * Asks every participating backend at once and collects what answered, under
 * the given {@link FanInMode}.
 *
 * Concurrent, not sequential: these are independent reactors, and a fan-in's
 * latency should be the slowest backend's rather than their sum.
 */
export async function fanIn<T>(
  operation: string,
  participants: readonly ReactorBackend[],
  call: (backend: ReactorBackend) => Promise<T>,
  options: FanInOptions,
): Promise<readonly Answer<T>[]> {
  const settled = await Promise.allSettled(
    participants.map((backend) => invoke(call, backend)),
  );
  const answers: Answer<T>[] = [];
  const failures: Failure[] = [];
  const excluded: Failure[] = [];
  const notSupported: Failure[] = [];
  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i];
    const backend = participants[i];
    if (outcome.status === "fulfilled") {
      answers.push({ backend, value: outcome.value });
      continue;
    }
    const failure: Failure = { backend: backend.name, error: outcome.reason };
    if (isOperationNotSupported(outcome.reason)) {
      if (options.tolerateNotSupported) {
        excluded.push(failure);
      } else {
        notSupported.push(failure);
      }
      continue;
    }
    failures.push(failure);
  }
  // A TOLERATED not-applicable backend is surfaced in both modes and never
  // silently dropped, but it is not a failure: the result is the union of the
  // capable backends, minus the ones this read opted to exclude by contract.
  for (const skip of excluded) {
    options.onDiagnostic(
      `${operation}: backend ${skip.backend} is not applicable to this read and was excluded from the fan-in (${messageOf(skip.error)})`,
      skip.error,
    );
  }
  // A not-supported this read did NOT opt to tolerate is a hard failure no mode
  // may mask: the backend that could not answer might have held the only
  // trustworthy answer, so a union of the others would be confidently wrong.
  if (notSupported.length > 0) {
    throw new FanInPartialFailureError(
      operation,
      notSupported,
      answers.map((answer) => answer.value),
      exclusionsOf(excluded),
    );
  }
  if (options.mode === "strict" && failures.length > 0) {
    throw new FanInPartialFailureError(
      operation,
      failures,
      answers.map((answer) => answer.value),
      exclusionsOf(excluded),
    );
  }
  // Every backend was excluded as not applicable and none answered: there is no
  // union to return, so an all-excluded read is a HARD error, never an empty
  // page -- even a read that opted to tolerate exclusions.
  if (answers.length === 0 && failures.length === 0 && excluded.length > 0) {
    throw new FanInPartialFailureError(
      operation,
      [],
      [],
      exclusionsOf(excluded),
    );
  }
  if (failures.length === 0) {
    return answers;
  }
  if (answers.length === 0) {
    rethrow(failures[0].error);
  }
  for (const failure of failures) {
    options.onDiagnostic(
      `${operation}: backend ${failure.backend} contributed nothing (${messageOf(failure.error)})`,
      failure.error,
    );
  }
  return answers;
}

/** Reduces excluded backends to the name+reason the partial-failure carries. */
function exclusionsOf(excluded: readonly Failure[]): readonly FanInExclusion[] {
  return excluded.map((entry) => ({
    backend: entry.backend,
    reason: messageOf(entry.error),
  }));
}

/**
 * A boolean existence fan-in -- "does ANY backend answer true?".
 *
 * True wins outright: a backend that answered true settles the question, and a
 * backend that could not answer cannot turn that true into a false. A FALSE,
 * though, is only trustworthy when EVERY backend actually answered false. If any
 * backend failed at runtime or cannot serve the read by contract, the honest
 * result is unknown -- returning false would be a confidently-wrong negative (an
 * id reported free, a document reported not served) exactly when a non-answering
 * backend might have held it. So an all-false with any gap is raised as a
 * {@link FanInPartialFailureError}, never silently reported as false. There is
 * no `tolerateNotSupported` here: a not-supported backend is a gap like any
 * other, because the answer this read owes cannot be given without it.
 */
export async function fanInExistence(
  operation: string,
  participants: readonly ReactorBackend[],
  call: (backend: ReactorBackend) => Promise<boolean>,
  onDiagnostic: RouterDiagnostic,
): Promise<boolean> {
  const settled = await Promise.allSettled(
    participants.map((backend) => invoke(call, backend)),
  );
  const failures: Failure[] = [];
  const excluded: Failure[] = [];
  let answeredTrue = false;
  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i];
    const backend = participants[i];
    if (outcome.status === "fulfilled") {
      if (outcome.value) {
        answeredTrue = true;
      }
      continue;
    }
    const failure: Failure = { backend: backend.name, error: outcome.reason };
    if (isOperationNotSupported(outcome.reason)) {
      excluded.push(failure);
    } else {
      failures.push(failure);
    }
  }
  if (answeredTrue) {
    for (const gap of [...excluded, ...failures]) {
      onDiagnostic(
        `${operation}: backend ${gap.backend} could not answer, but another backend answered true (${messageOf(gap.error)})`,
        gap.error,
      );
    }
    return true;
  }
  if (failures.length > 0 || excluded.length > 0) {
    throw new FanInPartialFailureError(
      operation,
      failures,
      false,
      exclusionsOf(excluded),
    );
  }
  return false;
}

/**
 * Calls a backend, turning a SYNCHRONOUS throw into a rejection.
 *
 * A client is not obliged to be a well-behaved async function: the worker RPC
 * proxies in `reactor-browser` throw synchronously for a surface they do not
 * serve, and one of those inside `participants.map` would escape the fan-in's
 * whole failure policy and reject the operation before any backend had been
 * asked.
 */
function invoke<T>(
  call: (backend: ReactorBackend) => Promise<T>,
  backend: ReactorBackend,
): Promise<T> {
  try {
    return call(backend);
  } catch (error) {
    return rejectedWith(error);
  }
}

/** Which backends a paged fan-in asks, and with which of their own cursors. */
export type PagedParticipant = {
  readonly backend: ReactorBackend;
  readonly cursor: string;
};

/**
 * Resolves the participants for a paged fan-in from the caller's paging.
 *
 * An empty cursor starts every backend at its own beginning. A router cursor
 * names exactly the backends that still had a page, with their own cursors --
 * so a continuation does not re-ask a backend that was already exhausted. A
 * non-empty cursor that is NOT a router cursor is refused unless there is only
 * one backend to hand it to, because with several backends there is no way to
 * know whose cursor it is, and guessing would silently page the wrong reactor.
 *
 * A router cursor can also name a backend that is no longer configured -- the
 * topology changed between the page that minted it and this continuation. That
 * is exactly the shape of thing {@link FanInMode} already governs for a failed
 * backend, so it is decided the same way: under `strict`, the missing backend
 * is raised as a {@link FanInPartialFailureError} naming it rather than
 * quietly shortening the page; under `tolerant`, it is reported through
 * `onDiagnostic` and dropped.
 */
export function pagedParticipants(
  operation: string,
  backends: readonly ReactorBackend[],
  paging: PagingOptions | undefined,
  options: FanInOptions,
): readonly PagedParticipant[] {
  const cursor = paging?.cursor ?? "";
  if (cursor === "") {
    return backends.map((backend) => ({ backend, cursor: "" }));
  }
  if (!isFanInCursor(cursor)) {
    if (backends.length === 1) {
      return [{ backend: backends[0], cursor }];
    }
    throw new InvalidFanInCursorError(
      cursor,
      `${operation} spans ${backends.length} backends, so it can only continue from a cursor this router issued`,
    );
  }
  const decoded = decodeFanInCursor(cursor);
  const participants: PagedParticipant[] = [];
  const missing: Failure[] = [];
  for (const entry of decoded) {
    const backend = backends.find(
      (candidate) => candidate.name === entry.backend,
    );
    if (backend === undefined) {
      missing.push({
        backend: entry.backend,
        error: new Error(
          `backend ${JSON.stringify(entry.backend)} named by this continuation cursor is no longer configured`,
        ),
      });
      continue;
    }
    participants.push({ backend, cursor: entry.cursor });
  }
  if (missing.length === 0) {
    return participants;
  }
  if (options.mode === "strict") {
    throw new FanInPartialFailureError(operation, missing, participants, []);
  }
  for (const failure of missing) {
    options.onDiagnostic(
      `${operation}: ${messageOf(failure.error)}`,
      failure.error,
    );
  }
  return participants;
}

export type MergePagedOptions<T> = {
  readonly operation: string;
  readonly mode: FanInMode;
  readonly onDiagnostic: RouterDiagnostic;
  readonly tolerateNotSupported: boolean;
  /** The identity two backends' copies of one document share. */
  readonly identify: (item: T) => string;
  readonly paging: PagingOptions | undefined;
};

/**
 * Runs a paged read across several backends and merges the pages into one.
 *
 * **Ordering is backend-major and documented, not emergent.** The merged
 * `results` are each backend's page concatenated in the router's stable backend
 * order (configuration order), with each backend's own ordering preserved
 * inside its block. There is no global sort key available: the reactor's paged
 * reads order by a per-store ordinal, and ordinals from two independent stores
 * are not comparable, so any "merged ordering" claim beyond this one would be
 * fiction. A caller that needs a global order sorts the merged results itself
 * on a field of the documents.
 *
 * **Duplicates are removed by document identity**, first occurrence winning --
 * so an earlier backend's copy of a document that sync replicated to both is
 * the one served. Without this, a synced drive's documents would appear once
 * per backend holding them, which is the most visible way a fan-in can lie.
 *
 * **`limit` is per backend, not per merged page.** Each backend is asked for
 * `limit` rows, so the merged page holds up to `backends * limit` documents
 * (fewer after de-duplication). Truncating to `limit` would require telling
 * each backend where its own page was cut, which only that backend's cursor can
 * express -- the router does not mint backend cursors, it carries them. The
 * echoed `options` therefore state the limit as it was passed down.
 *
 * **A caller that set no limit gets every backend's own default page size, on
 * every page, including continuations.** `limit === 0` is this function's
 * sentinel for "the caller did not ask for a specific size" (see
 * {@link MergePagedOptions.paging}), and it is forwarded to the backend as-is
 * rather than inflated to `Number.MAX_SAFE_INTEGER`: every backend treats a
 * falsy limit as "use my own default", the same convention `find`'s first,
 * paging-less call already relies on. Inflating it on a continuation would
 * make page 2 an unbounded pull that page 1 never was.
 *
 * The merged `nextCursor` names only the backends that reported one, and
 * `next()` continues exactly those.
 */
export async function mergePaged<T>(
  participants: readonly PagedParticipant[],
  call: (
    backend: ReactorBackend,
    paging: PagingOptions | undefined,
  ) => Promise<PagedResults<T>>,
  options: MergePagedOptions<T>,
): Promise<PagedResults<T>> {
  const limit = options.paging?.limit ?? 0;
  const answers = await fanIn(
    options.operation,
    participants.map((participant) => participant.backend),
    (backend) => {
      const participant = participants.find(
        (candidate) => candidate.backend === backend,
      );
      const cursor = participant?.cursor ?? "";
      const paging =
        options.paging === undefined && cursor === ""
          ? undefined
          : { cursor, limit };
      return call(backend, paging);
    },
    {
      mode: options.mode,
      onDiagnostic: options.onDiagnostic,
      tolerateNotSupported: options.tolerateNotSupported,
    },
  );

  const results: T[] = [];
  const seen = new Set<string>();
  const nextCursors: BackendCursor[] = [];
  for (const answer of answers) {
    for (const item of answer.value.results) {
      const identity = options.identify(item);
      if (identity !== "" && seen.has(identity)) {
        continue;
      }
      if (identity !== "") {
        seen.add(identity);
      }
      results.push(item);
    }
    const next = answer.value.nextCursor ?? "";
    if (next !== "") {
      nextCursors.push({ backend: answer.backend.name, cursor: next });
    }
  }

  const merged: PagedResults<T> = {
    results,
    options: options.paging ?? { cursor: "", limit: results.length },
  };
  if (nextCursors.length === 0) {
    return merged;
  }
  const nextParticipants = nextCursors.map((entry) => ({
    backend: participants.find(
      (participant) => participant.backend.name === entry.backend,
    )?.backend,
    cursor: entry.cursor,
  }));
  const continued: PagedParticipant[] = [];
  for (const entry of nextParticipants) {
    if (entry.backend !== undefined) {
      continued.push({ backend: entry.backend, cursor: entry.cursor });
    }
  }
  return {
    ...merged,
    nextCursor: encodeFanInCursor(nextCursors),
    next: () =>
      mergePaged(continued, call, {
        ...options,
        paging: { cursor: encodeFanInCursor(nextCursors), limit },
      }),
  };
}
