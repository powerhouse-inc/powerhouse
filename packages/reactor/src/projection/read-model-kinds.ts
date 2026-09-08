/**
 * Runtime companion to {@link BuiltInReadModelKind}, which lives in
 * `protocol.ts` — a types-only module that must not emit runtime code.
 *
 * @see Sharded projection workers sub-feature brief
 *   (Powerhouse board wiki id: eb26f01f-8f68-4918-a6f6-ac7a4679b533)
 */

import type { BuiltInReadModelKind } from "./protocol.js";

/**
 * Every {@link BuiltInReadModelKind}, at runtime. Derived from a total
 * record so adding a kind to the union without adding it here is a compile
 * error: under projection sharding a kind missing from both `preReadyKinds`
 * and `postReadyKinds` is indexed by nobody — the host's own copies never
 * index an operation — so a gap here reads as silently stale data.
 */
export const BUILT_IN_READ_MODEL_KINDS = Object.keys({
  "document-view": true,
  "document-indexer": true,
} satisfies Record<BuiltInReadModelKind, true>) as BuiltInReadModelKind[];
