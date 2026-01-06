import type { DocumentModelTemplateInputs } from "@powerhousedao/codegen/ts-morph";
import { ts } from "@tmpl/core";

export const documentModelPhFactoriesFileTemplate = (
  v: DocumentModelTemplateInputs,
) =>
  ts`
/**
 * Factory methods for creating ${v.phDocumentTypeName} instances
 */
import type {
  PHAuthState,
  PHDocumentState,
  PHBaseState,
} from "document-model";
import {
  createBaseState,
  defaultBaseState,
} from "document-model/core";
import type {
  ${v.phDocumentTypeName},
  ${v.localStateName},
  ${v.globalStateName},
  ${v.phStateName},
} from "./types.js";
import { createDocument } from "./utils.js";

export function defaultGlobalState(): ${v.globalStateName} {
  return ${v.initialGlobalState};
}

export function defaultLocalState(): ${v.localStateName} {
  return ${v.initialLocalState};
}

export function defaultPHState(): ${v.phStateName} {
  return {
    ...defaultBaseState(),
    global: defaultGlobalState(),
    local: defaultLocalState(),
  };
}

export function createGlobalState(
  state?: Partial<${v.globalStateName}>,
): ${v.globalStateName} {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  } as ${v.globalStateName};
}

export function createLocalState(
  state?: Partial<${v.localStateName}>,
): ${v.localStateName} {
  return {
    ...defaultLocalState(),
    ...(state || {}),
  } as ${v.localStateName};
}

export function createState(
  baseState?: Partial<PHBaseState>,
  globalState?: Partial<${v.globalStateName}>,
  localState?: Partial<${v.localStateName}>,
): ${v.phStateName} {
  return {
    ...createBaseState(baseState?.auth, baseState?.document),
    global: createGlobalState(globalState),
    local: createLocalState(localState),
  };
}

/**
 * Creates a ${v.phDocumentTypeName} with custom global and local state
 * This properly handles the PHBaseState requirements while allowing
 * document-specific state to be set.
 */
export function create${v.phDocumentTypeName}(
  state?: Partial<{
    auth?: Partial<PHAuthState>;
    document?: Partial<PHDocumentState>;
    global?: Partial<${v.globalStateName}>;
    local?: Partial<${v.localStateName}>;
  }>,
): ${v.phDocumentTypeName} {
  const document = createDocument(
    state ? createState(
      createBaseState(state.auth, state.document),
      state.global,
      state.local,
    ) : undefined
  );

  return document;
}
`.raw;
