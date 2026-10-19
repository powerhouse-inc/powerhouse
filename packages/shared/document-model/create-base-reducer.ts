import type { ProtocolVersions } from "./signature-policy.js";
import { stateReducerOf } from "./state-reducer.js";
import type { DocumentModelModule } from "./types.js";

export type CreateBaseReducerLogger = {
  debug: (message: string, ...replacements: unknown[]) => void;
  warn: (message: string, ...replacements: unknown[]) => void;
};

// Registered types only, so bounded by the registry.
const warnedUntaggedTypes = new Set<string>();

/**
 * Base-reducer 3 needs every registered version's reducer from createReducer.
 * An unregistered type takes 2: its reducer cannot be checked.
 */
export function fitCreateBaseReducer(
  selected: ProtocolVersions,
  documentType: string | undefined,
  modules: readonly DocumentModelModule[],
  logger: CreateBaseReducerLogger,
): ProtocolVersions {
  if (documentType === undefined || selected["base-reducer"] !== 3) {
    return selected;
  }
  const registered = modules.filter(
    (module) => module.documentModel.global.id === documentType,
  );
  if (registered.length === 0) {
    // Callers supply the type, so it is not remembered.
    logger.debug(
      "@documentType is not registered; its new documents take base-reducer 2",
      documentType,
    );
    return { ...selected, "base-reducer": 2 };
  }
  const untagged = registered.some(
    (module) => stateReducerOf(module.reducer) === undefined,
  );
  if (!untagged) {
    return selected;
  }
  if (!warnedUntaggedTypes.has(documentType)) {
    warnedUntaggedTypes.add(documentType);
    logger.warn(
      "@documentType has a reducer not built by createReducer; its new documents take base-reducer 2",
      documentType,
    );
  }
  return { ...selected, "base-reducer": 2 };
}
