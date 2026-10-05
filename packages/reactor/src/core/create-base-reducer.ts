import {
  stateReducerOf,
  type DocumentModelModule,
  type ProtocolVersions,
} from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";

const warnedTypes = new Set<string>();

/** Base-reducer 3 needs every registered version's reducer from createReducer. */
export function fitCreateBaseReducer(
  selected: ProtocolVersions,
  documentType: string | undefined,
  modules: readonly DocumentModelModule[],
  logger: ILogger,
): ProtocolVersions {
  if (documentType === undefined || selected["base-reducer"] !== 3) {
    return selected;
  }
  const untagged = modules.some(
    (module) =>
      module.documentModel.global.id === documentType &&
      stateReducerOf(module.reducer) === undefined,
  );
  if (!untagged) {
    return selected;
  }
  if (!warnedTypes.has(documentType)) {
    warnedTypes.add(documentType);
    logger.warn(
      "@documentType has a reducer not built by createReducer; its new documents take base-reducer 2",
      documentType,
    );
  }
  return { ...selected, "base-reducer": 2 };
}
