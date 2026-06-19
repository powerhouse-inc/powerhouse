import { readPgVersionFile } from "./pglite-idb.js";
import { coerceMajor, type DetectedMajor } from "./pglite-major.js";
import { REACTOR_IDB_NAME, RELATIONAL_IDB_NAME } from "./storage-namespace.js";

export {
  CURRENT_PG_MAJOR,
  SUPPORTED_PG_MAJORS,
  coerceMajor,
  resolvePgMajorForRuntime,
  loadPGliteModule,
  loadPgDump,
  type SupportedPgMajor,
  type DetectedMajor,
} from "./pglite-major.js";

let cachedReactorMajor: DetectedMajor | undefined;
let inflight: Promise<DetectedMajor> | undefined;
const majorListeners = new Set<() => void>();

function notifyMajorChanged() {
  for (const l of majorListeners) l();
}

export function subscribeReactorPgMajor(cb: () => void): () => void {
  majorListeners.add(cb);
  return () => {
    majorListeners.delete(cb);
  };
}

export async function detectReactorPgMajor(): Promise<DetectedMajor> {
  if (cachedReactorMajor !== undefined) return cachedReactorMajor;
  if (inflight) return inflight;

  inflight = (async () => {
    const major = coerceMajor(await readPgVersionFile(REACTOR_IDB_NAME));
    cachedReactorMajor = major;
    notifyMajorChanged();
    return major;
  })();
  try {
    return await inflight;
  } finally {
    inflight = undefined;
  }
}

export function getCachedReactorPgMajor(): DetectedMajor | undefined {
  return cachedReactorMajor;
}

export function invalidateReactorPgMajorCache(): void {
  cachedReactorMajor = undefined;
  notifyMajorChanged();
}

export async function detectRelationalPgMajor(): Promise<DetectedMajor> {
  return coerceMajor(await readPgVersionFile(RELATIONAL_IDB_NAME));
}
