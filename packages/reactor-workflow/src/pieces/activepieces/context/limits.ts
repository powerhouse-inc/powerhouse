// One file-size ceiling for both directions. Inbound hydration (a FILE prop
// that arrives as a URL, a data URI or an attachment ref) and outbound
// ctx.files.write share it, because a piece that can emit a file the next step
// cannot ingest is worse than a piece that refuses both.
export const DEFAULT_MAX_FILE_BYTES = 8 * 1024 * 1024;

// Read per call rather than at import: a host may set the override after this
// module is loaded, and tests need to move it.
export function maxFileBytes(): number {
  const raw = process.env.PH_WORKFLOWS_PIECE_MAX_FILE_BYTES;
  if (raw === undefined) return DEFAULT_MAX_FILE_BYTES;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed)
    : DEFAULT_MAX_FILE_BYTES;
}

export class FileTooLargeError extends Error {
  readonly size: number;
  readonly limit: number;

  constructor(size: number, limit: number = maxFileBytes()) {
    super(
      `File of ${size} bytes exceeds the ${limit} byte limit ` +
        `(raise PH_WORKFLOWS_PIECE_MAX_FILE_BYTES to allow more)`,
    );
    this.name = "FileTooLargeError";
    this.size = size;
    this.limit = limit;
  }
}

export function assertWithinLimit(size: number): void {
  const limit = maxFileBytes();
  if (size > limit) throw new FileTooLargeError(size, limit);
}
