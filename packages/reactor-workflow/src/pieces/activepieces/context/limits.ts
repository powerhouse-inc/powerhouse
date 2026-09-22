// One file-size ceiling for both directions. Inbound hydration (a FILE prop
// that arrives as a URL, a data URI or an attachment ref) and outbound
// ctx.files.write share it, because a piece that can emit a file the next step
// cannot ingest is worse than a piece that refuses both.
export const DEFAULT_MAX_FILE_BYTES = 8 * 1024 * 1024;

// What the environment asks for, or undefined when it asks for nothing usable.
// Read per call: a host may set it after this module is loaded.
export function configuredMaxFileBytes(): number | undefined {
  const raw = process.env.PH_WORKFLOWS_PIECE_MAX_FILE_BYTES;
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}

// The worker child is forked without an environment, so its limit arrives on
// the wire instead. Requests are serialized per worker: one value at a time.
let fromWire: number | undefined;

export function setMaxFileBytes(limit: number | undefined): void {
  fromWire = limit;
}

export function maxFileBytes(): number {
  return fromWire ?? configuredMaxFileBytes() ?? DEFAULT_MAX_FILE_BYTES;
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
