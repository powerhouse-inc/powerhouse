import type { Kysely } from "kysely";
import type { OutOfOrderPair } from "../decision/stream-order.js";
import { firstOutOfOrderPair } from "../decision/stream-order.js";
import type { IOperationStore } from "../storage/interfaces.js";
import type { Database } from "../storage/kysely/types.js";

/** A stream whose stored order makes it unsafe for `authEnforcement`. */
export type StreamOrderFailure = {
  documentId: string;
  branch: string;
  pair: OutOfOrderPair;
};

export type StreamOrderSweepResult = {
  streamsChecked: number;
  failures: StreamOrderFailure[];
};

/**
 * Sweeps every stream that carries operations in the given scope and reports
 * the ones the auth projection could not walk, or that the monotonic rule
 * would refuse to replicate.
 */
export async function sweepStreamOrder(
  db: Kysely<Database>,
  operationStore: IOperationStore,
  scope = "auth",
): Promise<StreamOrderSweepResult> {
  const streams = await db
    .selectFrom("Operation")
    .select(["documentId", "branch"])
    .where("scope", "=", scope)
    .distinct()
    .execute();

  const failures: StreamOrderFailure[] = [];
  for (const { documentId, branch } of streams) {
    const stored = await operationStore.getSince(documentId, scope, branch, -1);
    const pair = firstOutOfOrderPair(stored.results, {
      requireStrict: scope === "auth",
    });
    if (pair === undefined) continue;

    failures.push({ documentId, branch, pair });
  }

  return { streamsChecked: streams.length, failures };
}
