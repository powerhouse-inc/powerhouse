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
 * Whether base-reducer 3 can run `documentType`: every registered version's
 * reducer is from createReducer. Undefined when no version is registered.
 */
export function runsBaseReducer3(
  documentType: string,
  modules: readonly DocumentModelModule[],
): boolean | undefined {
  const registered = modules.filter(
    (module) => module.documentModel.global.id === documentType,
  );
  if (registered.length === 0) return undefined;
  return registered.every(
    (module) => stateReducerOf(module.reducer) !== undefined,
  );
}

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
  const runs = runsBaseReducer3(documentType, modules);
  if (runs === undefined) {
    // Callers supply the type, so it is not remembered.
    logger.debug(
      "@documentType is not registered; its new documents take base-reducer 2",
      documentType,
    );
    return { ...selected, "base-reducer": 2 };
  }
  if (runs) {
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
