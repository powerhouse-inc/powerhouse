import { isDriveAuthError } from "@powerhousedao/reactor";

/** A drive create the switchboard new drives go to did not answer. */
export class NewDriveUnansweredError extends Error {
  override readonly name = "NewDriveUnansweredError";

  constructor(
    readonly backend: string,
    options?: ErrorOptions,
  ) {
    super(`${backend} isn't answering, so the drive wasn't created.`, options);
  }
}

/** `auth`: the switchboard refused the caller, so signing in may help. */
export class NewDriveRefusedError extends Error {
  override readonly name = "NewDriveRefusedError";

  constructor(
    readonly backend: string,
    readonly auth: boolean,
    reason: string | undefined,
    options?: ErrorOptions,
  ) {
    super(
      reason
        ? `${backend} refused the new drive: ${reason}`
        : `${backend} refused the new drive.`,
      options,
    );
  }
}

// fetch's network failure: Node, Chrome, Firefox, Safari.
const NETWORK_FAILURE =
  /fetch failed|failed to fetch|networkerror|load failed/i;

type Failure = {
  name?: unknown;
  message?: unknown;
  cause?: unknown;
  statusCode?: unknown;
  category?: unknown;
  response?: { status?: unknown; errors?: { message?: unknown }[] };
};

/** Each error in the cause chain, outermost first. */
function* chain(error: unknown): Generator<Failure> {
  for (let at = error; at; at = (at as Failure).cause) yield at as Failure;
}

function statusOf(at: Failure): number | undefined {
  const status = at.response?.status ?? at.statusCode;
  return typeof status === "number" ? status : undefined;
}

/** A failure to reach a switchboard, not an answer from it. */
function isUnanswered(error: unknown): boolean {
  for (const at of chain(error)) {
    if (
      at.name === "SwitchboardUnreachableError" ||
      at.name === "TimeoutError" ||
      at.name === "ProbeTimeoutError" ||
      at.category === "network" ||
      (at instanceof TypeError && NETWORK_FAILURE.test(at.message))
    ) {
      return true;
    }
    const status = statusOf(at);
    if (status !== undefined && status >= 500) return true;
  }
  return false;
}

function isAuthRefusal(error: unknown): boolean {
  for (const at of chain(error)) {
    if (isDriveAuthError(at)) return true;
    const status = statusOf(at);
    if (status === 401 || status === 403) return true;
  }
  return false;
}

/** An answer from a server, not a failure in this browser. */
function isServerAnswer(error: unknown): boolean {
  for (const at of chain(error)) {
    if (
      at.response !== undefined ||
      statusOf(at) !== undefined ||
      at.name === "GraphQLRequestError" ||
      at.name === "MisrouteUnresolvedError"
    ) {
      return true;
    }
  }
  return false;
}

/** The first reason the switchboard gave, if it gave one. */
function reasonOf(error: unknown): string | undefined {
  for (const at of chain(error)) {
    const message = at.response?.errors?.[0]?.message;
    if (typeof message === "string" && message !== "") return message;
    if (at.name === "GraphQLRequestError" && typeof at.message === "string") {
      return at.message;
    }
  }
  return undefined;
}

/** A failed drive create, named for the switchboard `client` creates new drives on; else `error` itself. */
export function newDriveError(client: unknown, error: unknown): unknown {
  const backend = (client as { newDrives?: unknown } | null | undefined)
    ?.newDrives;
  if (typeof backend !== "string") return error;
  if (isUnanswered(error)) {
    return new NewDriveUnansweredError(backend, { cause: error });
  }
  if (!isServerAnswer(error)) return error;
  return new NewDriveRefusedError(
    backend,
    isAuthRefusal(error),
    reasonOf(error),
    { cause: error },
  );
}
