/**
 * Sticky-by-document routing for the executor worker pool.
 *
 * Hashes `documentId` to a stable bucket so every job on a given document
 * lands on the same worker. The queue already enforces "at most one job
 * executing per document at a time", so a sticky worker always sees a fresh
 * post-commit snapshot before its next job on that document — which keeps
 * the per-worker `IWriteCache` and `IDocumentMetaCache` coherent for free.
 *
 * The hash is FNV-1a 32-bit: deterministic, dependency-free, and stable
 * across processes (so the same routing decision can be reproduced anywhere
 * the documentId is known).
 *
 * @see Executor Worker Pool Design wiki page
 *   (Powerhouse board wiki id: d400d711-f07e-4389-a226-4e9fdd4fa8ba)
 */

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export function hashDocumentId(documentId: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < documentId.length; i++) {
    hash ^= documentId.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

/**
 * Picks the worker bucket for a document under consistent hashing.
 *
 * Exported from the package root alongside {@link hashDocumentId} because the
 * convention is shared, not private to this worker pool: the executor pool,
 * the projection shard manager, and the multi-reactor router all place a key
 * with this exact hash, and a second implementation of it would place the
 * same key differently. Importing this one definition everywhere it is
 * needed is what keeps those placements agreeing with each other.
 */
export function bucketFor(documentId: string, numWorkers: number): number {
  if (numWorkers < 1) {
    throw new Error(`bucketFor: numWorkers must be >= 1 (got ${numWorkers})`);
  }
  return hashDocumentId(documentId) % numWorkers;
}
