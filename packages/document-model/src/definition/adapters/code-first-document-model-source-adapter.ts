import type {
  Actions,
  DocumentModelDefinitionV1,
  DocumentModelModule,
  JsonValue,
  PHBaseState,
} from "@powerhousedao/shared/document-model";
import { snapshotDataArray, snapshotDataRecord } from "../data-properties.js";
import { failDefinition } from "../diagnostics.js";
import { canonicalJson, cloneJson, sha256 } from "../primitives.js";

export type NormalizedCodeFirstDocumentModelSource = {
  readonly kind: "code-first-document-model-source";
  readonly module: DocumentModelModule;
  readonly definition: DocumentModelDefinitionV1;
  readonly digest: `sha256:${string}`;
  readonly documentType: string;
  readonly version: number;
};

type CodeFirstModule = DocumentModelModule<PHBaseState> & {
  readonly version: number;
  readonly actions: Actions;
  readonly definition: DocumentModelDefinitionV1;
};

type InspectedCodeFirstModule = {
  readonly module: CodeFirstModule;
  readonly definition: DocumentModelDefinitionV1;
  readonly version: number;
  readonly documentType: string;
};

function inspectCodeFirstModule(
  value: unknown,
): InspectedCodeFirstModule | undefined {
  const root = snapshotDataRecord(value);
  if (
    !root.ok ||
    !Number.isSafeInteger(root.value.version) ||
    root.value.version === undefined
  ) {
    return undefined;
  }
  let definition: DocumentModelDefinitionV1;
  try {
    definition = cloneJson(
      root.value.definition as JsonValue,
    ) as DocumentModelDefinitionV1;
  } catch {
    return undefined;
  }
  const model = snapshotDataRecord(definition.model);
  const specifications = snapshotDataArray(definition.specifications);
  const actions = snapshotDataRecord(root.value.actions);
  const documentModel = snapshotDataRecord(root.value.documentModel);
  const global = documentModel.ok
    ? snapshotDataRecord(documentModel.value.global)
    : undefined;
  if (
    definition.kind !== "powerhouse.document-model" ||
    definition.formatVersion !== 1 ||
    !model.ok ||
    typeof model.value.documentType !== "string" ||
    !specifications.ok ||
    typeof root.value.reducer !== "function" ||
    !actions.ok ||
    !global?.ok ||
    global.value.id !== model.value.documentType
  ) {
    return undefined;
  }
  return {
    module: root.value as unknown as CodeFirstModule,
    definition,
    version: root.value.version as number,
    documentType: model.value.documentType,
  };
}

/** Normalizes a finalized code-first module without reparsing its stored SDL. */
export class CodeFirstDocumentModelSourceAdapter {
  canAdapt(value: unknown): value is CodeFirstModule {
    return inspectCodeFirstModule(value) !== undefined;
  }

  adapt(value: unknown): NormalizedCodeFirstDocumentModelSource {
    const inspected = inspectCodeFirstModule(value);
    if (!inspected) {
      return failDefinition({
        code: "PH-DM-CODE-FIRST-SOURCE-INVALID",
        path: [],
        message: "The source is not a finalized code-first document model.",
        repair:
          "Export the ordinary module returned by context.finalize() or family.at().",
      });
    }
    const specification = inspected.definition.specifications.find(
      (candidate) => candidate.version === inspected.version,
    );
    if (!specification) {
      return failDefinition({
        code: "PH-DM-CODE-FIRST-SOURCE-INVALID",
        path: ["definition", "specifications"],
        message: `The definition has no specification for module version ${inspected.version}.`,
        repair:
          "Materialize the module from the same explicit version family as its definition.",
      });
    }
    const encoded = canonicalJson(inspected.definition as unknown as JsonValue);
    return {
      kind: "code-first-document-model-source",
      module: inspected.module,
      definition: inspected.definition,
      digest: sha256(encoded),
      documentType: inspected.documentType,
      version: inspected.version,
    };
  }
}
