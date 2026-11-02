import {
  BASE_REDUCER_VERSIONS,
  capabilitiesOf,
  isBaseReducerVersion,
  modelRunsBaseReducer,
  needsTaggedModel,
  type BaseReducerVersion,
} from "./base-reducer-protocol.js";
import type { ProtocolVersions } from "./signature-policy.js";
import type { DocumentModelModule } from "./types.js";

export type CreateBaseReducerLogger = {
  debug: (message: string, ...replacements: unknown[]) => void;
  warn: (message: string, ...replacements: unknown[]) => void;
};

// Registered types only, so bounded by the registry.
const warnedUntaggedTypes = new Set<string>();

/**
 * Steps a selected base-reducer down to the highest version the model runs.
 * An unregistered type cannot be checked, so it takes the highest version
 * that needs no tagged reducer.
 */
export function fitCreateBaseReducer(
  selected: ProtocolVersions,
  documentType: string | undefined,
  modules: readonly DocumentModelModule[],
  logger: CreateBaseReducerLogger,
): ProtocolVersions {
  const version = selected["base-reducer"];
  if (documentType === undefined || !isBaseReducerVersion(version)) {
    return selected;
  }
  const runs = modelRunsBaseReducer(
    capabilitiesOf(version),
    documentType,
    modules,
  );
  if (runs === true || (runs === undefined && !needsTag(version))) {
    return selected;
  }
  const fitted = BASE_REDUCER_VERSIONS.filter(
    (lower) => lower < version && !needsTag(lower),
  ).at(-1);
  if (fitted === undefined) {
    return selected;
  }
  if (runs === undefined) {
    // Callers supply the type, so it is not remembered.
    logger.debug(
      `@documentType is not registered; its new documents take base-reducer ${fitted}`,
      documentType,
    );
  } else if (!warnedUntaggedTypes.has(documentType)) {
    warnedUntaggedTypes.add(documentType);
    logger.warn(
      `@documentType has a reducer not built by createReducer; its new documents take base-reducer ${fitted}`,
      documentType,
    );
  }
  return { ...selected, "base-reducer": fitted };
}

function needsTag(version: BaseReducerVersion): boolean {
  return needsTaggedModel(capabilitiesOf(version));
}
