import type { ProjectModuleKind } from "../api.js";
import type { DevtoolsFocus, DevtoolsTarget } from "../shell/location.js";
import { MODULE_KINDS } from "./kinds.js";

const MODEL_FOCUS = "model";
const MODULE_FOCUS = "module";
const MODULE_FOLDER_FOCUS = "module-folder";

/** What the Document models page shows. `version` is absent for the latest
 * one, `item` for the first of the outline. */
export type ModelSelection = {
  documentType: string;
  version?: number;
  item?: string;
};

/** `model:<documentType>[@v<version>][#<item>]` */
export function modelFocus({
  documentType,
  version,
  item,
}: ModelSelection): DevtoolsFocus {
  const at = version === undefined ? "" : `@v${version}`;
  const hash = item === undefined ? "" : `#${item}`;
  return { kind: MODEL_FOCUS, id: `${documentType}${at}${hash}` };
}

/** Reads a model focus against the document types the project has. A type
 * may itself contain `#` or end in `@v2`, so the longest type the id starts
 * with is the one meant. Undefined when the id names none of them. */
export function parseModelFocus(
  focus: DevtoolsFocus | undefined,
  documentTypes: readonly string[],
): ModelSelection | undefined {
  if (focus?.kind !== MODEL_FOCUS) return undefined;
  let found: ModelSelection | undefined;
  for (const documentType of documentTypes) {
    if (!focus.id.startsWith(documentType)) continue;
    if (found && found.documentType.length >= documentType.length) continue;
    const rest = /^(?:@v(\d+))?(?:#(.+))?$/.exec(
      focus.id.slice(documentType.length),
    );
    if (!rest) continue;
    const [, version, item] = rest;
    found = {
      documentType,
      ...(version !== undefined && { version: Number(version) }),
      ...(item !== undefined && { item }),
    };
  }
  return found;
}

type Listed = { id: string; module: { folder: string } };

/** The module of `modules` a focus names: `module:<id>`, or
 * `module-folder:<folder>` for one that states the id of another. */
export function focusedModule<T extends Listed>(
  focus: DevtoolsFocus | undefined,
  modules: readonly T[],
): T | undefined {
  if (focus?.kind === MODULE_FOLDER_FOCUS) {
    return modules.find(({ module }) => module.folder === focus.id);
  }
  if (focus?.kind === MODULE_FOCUS) {
    return modules.find(({ id }) => id === focus.id);
  }
  return undefined;
}

/** Where `entry` of `modules` is shown. Its id names it, unless another of
 * them states the same id: then only its folder tells the two apart. */
export function listedModuleTarget(
  kind: ProjectModuleKind,
  entry: Listed,
  modules: readonly Listed[],
): DevtoolsTarget {
  const idIsShared = modules.some(
    (other) => other !== entry && other.id === entry.id,
  );
  if (!idIsShared) return moduleTarget(kind, entry.id);
  return {
    panel: MODULE_KINDS[kind].panel,
    focus: { kind: MODULE_FOLDER_FOCUS, id: entry.module.folder },
  };
}

/** Where a module of the project is shown. */
export function moduleTarget(
  kind: ProjectModuleKind,
  id: string,
): DevtoolsTarget {
  return {
    panel: MODULE_KINDS[kind].panel,
    focus:
      kind === "document-model"
        ? modelFocus({ documentType: id })
        : { kind: MODULE_FOCUS, id },
  };
}
