import {
  stateReducerOf,
  type DocumentModelModule,
  type ProtocolVersions,
} from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";

const warnedTypes = new Set<string>();

/**
 * Base-reducer 3 needs every registered version's reducer from createReducer.
 * An unregistered type takes 2: its reducer cannot be checked.
 */
export function fitCreateBaseReducer(
  selected: ProtocolVersions,
  documentType: string | undefined,
  modules: readonly DocumentModelModule[],
  logger: ILogger,
): ProtocolVersions {
  if (documentType === undefined || selected["base-reducer"] !== 3) {
    return selected;
  }
  const registered = modules.filter(
    (module) => module.documentModel.global.id === documentType,
  );
  if (registered.length === 0) {
    warnOnce(
      logger,
      documentType,
      "@documentType is not registered; its new documents take base-reducer 2",
    );
    return { ...selected, "base-reducer": 2 };
  }
  const untagged = registered.some(
    (module) => stateReducerOf(module.reducer) === undefined,
  );
  if (!untagged) {
    return selected;
  }
  warnOnce(
    logger,
    documentType,
    "@documentType has a reducer not built by createReducer; its new documents take base-reducer 2",
  );
  return { ...selected, "base-reducer": 2 };
}

function warnOnce(logger: ILogger, documentType: string, message: string) {
  if (!warnedTypes.has(documentType)) {
    warnedTypes.add(documentType);
    logger.warn(message, documentType);
  }
}
