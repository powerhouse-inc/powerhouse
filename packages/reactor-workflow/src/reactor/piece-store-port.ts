// Adapts the run journal's `piece_store` table to the engine's PieceStorePort,
// so an action's `ctx.store` is durable the moment the piece writes it.

// Which workflow a step belongs to travels on the run scope, not the executor,
// which concurrent runs share.
import type { PieceStorePort, StoreScopeName } from "../pieces/index.js";
import { childLogger } from "document-model";
import type { WorkflowRunStore } from "./store.js";

const logger = childLogger(["workflow", "piece-store"]);

// PROJECT means "shared by every workflow in the project", and this reactor is
// that project: the trigger registry, the run journal and the secret store are
// all already instance-wide, so nothing new is shared by saying so.

// When a real tenancy model arrives this constant becomes its default project
// id, and the migration is one UPDATE. See issue #16.
export const PROJECT_SCOPE_KEY = "reactor";

// Appended to both partition keys for a design-time sample, so a test run
// cannot alias a live key however the piece happens to name it.

// The supervisor drops these partitions when the sample returns; a key prefix
// could do neither, since prefixes alias and nothing enumerates them.
const TEST_PARTITION_SUFFIX = "#test";

// A sample partitions by workflow in *both* scopes, unlike a live run: two
// samples on one project partition would read and then delete each other's.
export function testPartitionKey(
  scope: StoreScopeName,
  workflowId: string,
): string {
  const base =
    scope === "PROJECT" ? `${PROJECT_SCOPE_KEY}#${workflowId}` : workflowId;
  return base + TEST_PARTITION_SUFFIX;
}

// pollingHelper's cursor. Math.max over one unparseable date yields NaN, which
// then re-delivers the whole feed forever, or nothing ever again.
const CURSOR_KEY = "lastPoll";

// A provider's clock can run ahead of ours; beyond a day it is not skew, it is
// a cursor that would hold the trigger silent until that date passes.
const MAX_CURSOR_SKEW_MS = 24 * 60 * 60_000;

function isPlausibleCursor(value: unknown, now: number): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= now + MAX_CURSOR_SKEW_MS
  );
}

// The worker JSON-serialises what it writes, so a NaN or Infinity cursor
// arrives as null — still ours to reject, just no longer a number.
function isCursorShaped(value: unknown): boolean {
  return value === null || typeof value === "number";
}

// NaN and Infinity both serialise as "null", which is the one thing an
// operator reading the warning must not be told.
function showCursor(value: unknown): string {
  return typeof value === "number" ? String(value) : JSON.stringify(value);
}

function isCursorRef(key: string): boolean {
  return key === CURSOR_KEY || key.endsWith(`/${CURSOR_KEY}`);
}

export function createPieceStorePort(
  store: WorkflowRunStore,
  workflowIdFor: () => string | undefined,
  sample = false,
  clock: () => number = Date.now,
): PieceStorePort {
  // A step with no workflow in scope must fail rather than read or write
  // another workflow's keys.
  const flowKey = () => {
    const workflowId = workflowIdFor();
    if (!workflowId) {
      throw new Error("ctx.store is unavailable: no workflow is in scope");
    }
    return workflowId;
  };

  const partition = (scope: StoreScopeName): string =>
    sample
      ? testPartitionKey(scope, flowKey())
      : scope === "PROJECT"
        ? PROJECT_SCOPE_KEY
        : flowKey();

  // Async so that a missing run scope rejects rather than throwing out of a
  // method whose contract is a promise.
  return {
    get: async (key, scope) =>
      store.getPieceStoreValue(scope, partition(scope), key),
    // A durable store means the cursor no longer passes the supervisor on its
    // way to the database, so the guard that policed it lives here instead.
    put: async (key, value, scope) => {
      const now = clock();
      if (!isCursorRef(key) || isPlausibleCursor(value, now)) {
        return store.setPieceStoreValue(scope, partition(scope), key, value);
      }
      const kept = await store.getPieceStoreValue(scope, partition(scope), key);
      // Only our own cursor shape is ours to police: a piece that keeps its
      // own `lastPoll` as a string or an object is left to it.
      if (!isCursorShaped(value) && !isPlausibleCursor(kept, now)) {
        return store.setPieceStoreValue(scope, partition(scope), key, value);
      }
      logger.warn(
        `Rejected ${key}=${showCursor(value)} from workflow ${flowKey()}; keeping ${
          isPlausibleCursor(kept, now) ? String(kept) : "no cursor"
        }`,
      );
      // With nothing to fall back to the key is dropped, so the next poll
      // fails loudly rather than running on a cursor nobody chose.
      if (!isPlausibleCursor(kept, now)) {
        await store.deletePieceStoreValue(scope, partition(scope), key);
      }
    },
    delete: async (key, scope) =>
      store.deletePieceStoreValue(scope, partition(scope), key),
  };
}
