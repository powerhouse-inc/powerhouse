import type { PurgeDirective, PurgeOutcome } from "../shared/purge-types.js";
import type { IReadModel } from "./interfaces.js";
import { supportsDocumentPurge, supportsPurgeJournal } from "./interfaces.js";

/** One outcome per model at least; a model with no hook reads as uncovered. */
export async function purgeReadModels(
  readModels: readonly IReadModel[],
  ids: string[],
  directive: PurgeDirective,
): Promise<PurgeOutcome[]> {
  const outcomes: PurgeOutcome[] = [];

  for (const readModel of readModels) {
    // The journal pass also retries whatever an earlier purge left undone.
    if (supportsPurgeJournal(readModel)) {
      const reconciled = await readModel.reconcilePurges();
      outcomes.push(
        ...(reconciled.length > 0
          ? reconciled
          : [
              {
                readModelId: readModel.name,
                rowsAffected: 0,
                covered: true,
                notes: ["already reconciled"],
              },
            ]),
      );
      continue;
    }

    if (supportsDocumentPurge(readModel)) {
      try {
        const outcome = await readModel.purgeDocuments(ids, directive);
        if ("readModelId" in outcome) outcomes.push(outcome);
      } catch (error) {
        outcomes.push({
          readModelId: readModel.name,
          rowsAffected: 0,
          covered: true,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      continue;
    }

    outcomes.push({
      readModelId: readModel.name,
      rowsAffected: 0,
      covered: false,
    });
  }

  return outcomes;
}
