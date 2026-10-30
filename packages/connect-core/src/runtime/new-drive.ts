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

// fetch's network failure: Node, Chrome, Firefox, Safari.
const NETWORK_FAILURE =
  /fetch failed|failed to fetch|networkerror|load failed/i;

/** A failure to reach a switchboard, not an answer from it. */
function isUnanswered(error: unknown): boolean {
  for (let at = error; at; at = (at as { cause?: unknown }).cause) {
    const name = (at as { name?: unknown }).name;
    if (
      name === "SwitchboardUnreachableError" ||
      name === "TimeoutError" ||
      name === "ProbeTimeoutError" ||
      (at instanceof TypeError && NETWORK_FAILURE.test(at.message))
    ) {
      return true;
    }
    const status = (at as { response?: { status?: unknown } }).response?.status;
    if (typeof status === "number" && status >= 500) return true;
  }
  return false;
}

/**
 * The error a failed drive create reports: when `client` creates new drives
 * on a switchboard and the failure is that switchboard not answering, a
 * {@link NewDriveUnansweredError} naming it; otherwise `error` itself.
 */
export function newDriveError(client: unknown, error: unknown): unknown {
  const backend = (client as { newDrives?: unknown } | null | undefined)
    ?.newDrives;
  if (typeof backend !== "string" || !isUnanswered(error)) return error;
  return new NewDriveUnansweredError(backend, { cause: error });
}
