import type { DocumentModelDefinition } from "@powerhousedao/shared/document-model";
import { DefinitionDiagnosticCollector } from "./diagnostics.js";
import { checkDocumentModelDefinitionShape } from "./wire-shape.js";

/**
 * What a host may say about a registered module's compiled definition.
 *
 * A code-first model's declaration is TypeScript in its package's repository.
 * The compiled definition a running host holds is a *reading* of that source,
 * not a second copy of it that could be written back — there is no document
 * behind it, no operation that edits it, and no file it could be saved to.
 * Presenting it beside the controls that edit a schema-first model document
 * would offer an edit the host cannot perform.
 *
 * So a host that reports one asks here. The answer is either the
 * identity and the definition, marked read-only, or nothing at all. Nothing is
 * inferred: the version comes from the module, never from a document, and a
 * module whose `definition` does not pass the closed wire shape is not
 * reported as code-first at all.
 */

/** The authoring mode of a compiled definition. It is not writable. */
export type CodeFirstAuthoring = {
  readonly mode: "code-first";
  readonly writableThroughDocumentActions: false;
};

export const CODE_FIRST_AUTHORING: CodeFirstAuthoring = Object.freeze({
  mode: "code-first",
  writableThroughDocumentActions: false,
});

/**
 * Everything a host needs to report a compiled definition, and nothing that
 * cannot cross a worker boundary: the identity, the definition, and the
 * authoring mode. No reducer, no action creator, no callback.
 */
export type InspectableDefinition = {
  /** `module.documentModel.global.id`, never a document's model id. */
  readonly documentType: string;
  /** `module.version ?? 1`, the default every other host applies. */
  readonly version: number;
  readonly definition: DocumentModelDefinition;
  readonly authoring: CodeFirstAuthoring;
};

/**
 * The compiled definition a registered module carries, or `null`.
 *
 * Deliberately total: a module that carries no definition, or one whose
 * definition does not match the closed V1 wire shape, is simply not
 * inspectable. Reporting a malformed definition as code-first would put an
 * unreadable view in front of someone instead of the editor they expected.
 */
export function inspectableDefinition(
  module: unknown,
): InspectableDefinition | null {
  if (module === null || typeof module !== "object") return null;
  const candidate = module as {
    definition?: unknown;
    version?: unknown;
    documentModel?: { global?: { id?: unknown } };
  };
  if (candidate.definition === undefined) return null;

  const documentType = candidate.documentModel?.global?.id;
  if (typeof documentType !== "string" || documentType.length === 0) {
    return null;
  }
  // `version ?? 1`, spelled the way every other host spells it. A version that
  // is present but not a whole number is refused rather than coerced: `null`
  // and `true` both become a number, and neither is a version anyone wrote.
  const version = candidate.version ?? 1;
  if (
    typeof version !== "number" ||
    !Number.isInteger(version) ||
    version < 1
  ) {
    return null;
  }

  // The shape check reports rather than throws, and the collector is discarded:
  // a host is not the place to surface a compiler diagnostic, and `ph model
  // check` already refuses to publish a package whose definition fails this.
  const collector = new DefinitionDiagnosticCollector();
  if (!checkDocumentModelDefinitionShape(collector, candidate.definition)) {
    return null;
  }

  // The identity and the definition have to be about the same model. A view
  // whose header said one model and whose body held another would be worse
  // than no view, and nothing upstream prevents a module from carrying a
  // definition that was compiled for something else.
  const definition = candidate.definition;
  if (definition.model.documentType !== documentType) return null;
  if (
    !definition.specifications.some(
      (specification) => specification.version === version,
    )
  ) {
    return null;
  }

  return {
    documentType,
    version,
    definition,
    authoring: CODE_FIRST_AUTHORING,
  };
}
