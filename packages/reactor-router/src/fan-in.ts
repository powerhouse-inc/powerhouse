import type { PagedResults, PagingOptions } from "@powerhousedao/reactor";
import { UnsupportedByBackendError, type RouterBackend } from "./backend.js";
import {
  FanInPartialFailureError,
  InvalidFanInCursorError,
  messageOf,
  rejectedWith,
  rethrow,
} from "./errors.js";
import type { RouterDiagnostic } from "./types.js";

/** Marks a cursor this router minted: one cursor per participating backend. */
export const FAN_IN_CURSOR_PREFIX = "router:v1:";

export type BackendCursor = {
  readonly backend: string;
  readonly cursor: string;
};

export function isFanInCursor(cursor: string): boolean {
  return cursor.startsWith(FAN_IN_CURSOR_PREFIX);
}

export function encodeFanInCursor(cursors: readonly BackendCursor[]): string {
  return `${FAN_IN_CURSOR_PREFIX}${JSON.stringify(cursors)}`;
}

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

/** `tolerant` reports a failed backend instead of raising, unless all fail. */
export type FanInMode = "strict" | "tolerant";

export type FanInOptions = {
  readonly mode: FanInMode;
  readonly onDiagnostic: RouterDiagnostic;
};

export type Answer<T> = {
  readonly backend: RouterBackend;
  readonly value: T;
};

type Failure = {
  readonly backend: string;
  readonly error: unknown;
};

/** Asks every participant concurrently and collects the answers. */
export async function fanIn<T>(
  operation: string,
  participants: readonly RouterBackend[],
  call: (backend: RouterBackend) => Promise<T>,
  options: FanInOptions,
): Promise<readonly Answer<T>[]> {
  const settled = await Promise.allSettled(
    participants.map((backend) => invoke(call, backend)),
  );
  const answers: Answer<T>[] = [];
  const failures: Failure[] = [];
  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i];
    const backend = participants[i];
    if (outcome.status === "fulfilled") {
      answers.push({ backend, value: outcome.value });
    } else {
      failures.push({ backend: backend.name, error: outcome.reason });
    }
  }
  if (failures.length === 0) {
    return answers;
  }
  if (options.mode === "strict") {
    throw new FanInPartialFailureError(
      operation,
      failures,
      answers.map((answer) => answer.value),
    );
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

/** True wins; false needs every backend, `gaps` included, to have answered. */
export async function fanInExistence(
  operation: string,
  participants: readonly RouterBackend[],
  call: (backend: RouterBackend) => Promise<boolean>,
  onDiagnostic: RouterDiagnostic,
  gaps: readonly { backend: string; error: unknown }[] = [],
): Promise<boolean> {
  const settled = await Promise.allSettled(
    participants.map((backend) => invoke(call, backend)),
  );
  const failures: Failure[] = [...gaps];
  let answeredTrue = false;
  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i];
    if (outcome.status === "fulfilled") {
      answeredTrue = answeredTrue || outcome.value;
    } else {
      failures.push({ backend: participants[i].name, error: outcome.reason });
    }
  }
  if (answeredTrue) {
    for (const gap of failures) {
      onDiagnostic(
        `${operation}: backend ${gap.backend} could not answer, but another backend answered true (${messageOf(gap.error)})`,
        gap.error,
      );
    }
    return true;
  }
  if (failures.length > 0) {
    throw new FanInPartialFailureError(operation, failures, false);
  }
  return false;
}

/** Backends whose `refusal` is `""`; others are reported; none left refuses. */
export function supportingBackends(
  operation: string,
  backends: readonly RouterBackend[],
  refusal: (backend: RouterBackend) => string,
  onDiagnostic: RouterDiagnostic,
): readonly RouterBackend[] {
  const supporting: RouterBackend[] = [];
  const refused: UnsupportedByBackendError[] = [];
  for (const backend of backends) {
    const reason = refusal(backend);
    if (reason === "") {
      supporting.push(backend);
      continue;
    }
    refused.push(
      new UnsupportedByBackendError(backend.name, operation, reason),
    );
  }
  if (supporting.length === 0) {
    throw refused[0];
  }
  for (const error of refused) {
    onDiagnostic(
      `${operation}: backend ${error.backend} was excluded (${error.reason})`,
      error,
    );
  }
  return supporting;
}

/** A synchronous throw is that backend's rejection, not the whole read's. */
function invoke<T>(
  call: (backend: RouterBackend) => Promise<T>,
  backend: RouterBackend,
): Promise<T> {
  try {
    return call(backend);
  } catch (error) {
    return rejectedWith(error);
  }
}

export type PagedParticipant = {
  readonly backend: RouterBackend;
  readonly cursor: string;
};

/** A foreign cursor is accepted only when there is a single backend. */
export function pagedParticipants(
  operation: string,
  backends: readonly RouterBackend[],
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
  const participants: PagedParticipant[] = [];
  const missing: Failure[] = [];
  for (const entry of decodeFanInCursor(cursor)) {
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
    throw new FanInPartialFailureError(operation, missing, participants);
  }
  for (const failure of missing) {
    options.onDiagnostic(
      `${operation}: ${messageOf(failure.error)}`,
      failure.error,
    );
  }
  return participants;
}

export type MergePagedOptions<T> = FanInOptions & {
  readonly operation: string;
  /** Two backends' copies of one item share this; `""` never de-duplicates. */
  readonly identify: (item: T) => string;
  readonly paging: PagingOptions | undefined;
};

/** Backend-major order, first copy wins; `limit` applies per backend. */
export async function mergePaged<T>(
  participants: readonly PagedParticipant[],
  call: (
    backend: RouterBackend,
    paging: PagingOptions | undefined,
  ) => Promise<PagedResults<T>>,
  options: MergePagedOptions<T>,
): Promise<PagedResults<T>> {
  const limit = options.paging?.limit ?? 0;
  const answers = await fanIn(
    options.operation,
    participants.map((participant) => participant.backend),
    (backend) => {
      const cursor =
        participants.find((candidate) => candidate.backend === backend)
          ?.cursor ?? "";
      const paging =
        options.paging === undefined && cursor === ""
          ? undefined
          : { cursor, limit };
      return call(backend, paging);
    },
    options,
  );

  const results: T[] = [];
  const seen = new Set<string>();
  const nextCursors: BackendCursor[] = [];
  const continued: PagedParticipant[] = [];
  for (const answer of answers) {
    for (const item of answer.value.results) {
      const identity = options.identify(item);
      if (identity !== "") {
        if (seen.has(identity)) {
          continue;
        }
        seen.add(identity);
      }
      results.push(item);
    }
    const next = answer.value.nextCursor ?? "";
    if (next !== "") {
      nextCursors.push({ backend: answer.backend.name, cursor: next });
      continued.push({ backend: answer.backend, cursor: next });
    }
  }

  const merged: PagedResults<T> = {
    results,
    options: options.paging ?? { cursor: "", limit: results.length },
  };
  if (nextCursors.length === 0) {
    return merged;
  }
  const nextCursor = encodeFanInCursor(nextCursors);
  return {
    ...merged,
    nextCursor,
    next: () =>
      mergePaged(continued, call, {
        ...options,
        paging: { cursor: nextCursor, limit },
      }),
  };
}
