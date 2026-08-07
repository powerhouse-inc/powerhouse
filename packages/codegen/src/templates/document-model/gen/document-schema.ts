import { ts } from "@tmpl/core";
import type { DocumentModelFileMakerArgs } from "file-builders";

function priorVersions(versions: number[], currentVersion: number): number[] {
  return versions.filter((k) => k < currentVersion);
}

function makeOlderStateSchemaImports(
  versions: number[],
  currentVersion: number,
  phStateName: string,
): string {
  return priorVersions(versions, currentVersion)
    .map(
      (k) =>
        `import { ${phStateName}Schema as ${phStateName}SchemaV${k} } from "../../v${k}/gen/document-schema.js";`,
    )
    .join("\n");
}

function makeStateSchemasByVersion(
  versions: number[],
  currentVersion: number,
  phStateName: string,
): string {
  const entries = versions
    .filter((k) => k <= currentVersion)
    .map((k) => {
      const name =
        k === currentVersion
          ? `${phStateName}Schema`
          : `${phStateName}SchemaV${k}`;
      return `${k}: ${name}`;
    })
    .join(", ");
  return `{ ${entries} }`;
}

function makeDocumentSchemasByVersion(
  versions: number[],
  currentVersion: number,
  v: DocumentModelFileMakerArgs,
): string {
  const entries = versions
    .filter((k) => k <= currentVersion)
    .map((k) => {
      if (k === currentVersion) {
        return `${k}: ${v.phDocumentSchemaName}`;
      }
      return `${k}: z.object({ header: ${v.phDocumentTypeName}HeaderSchema, state: ${v.phStateName}SchemaV${k}, initialState: ${v.phStateName}SchemaV${k} })`;
    })
    .join(", ");
  return `{ ${entries} }`;
}

/**
 * Version-aware validators are only emitted for versions with released
 * predecessors: a document is validated against the schema of the version it
 * is stamped with, so a later version may add non-nullable fields without
 * rejecting documents that have not been upgraded yet.
 */
function makeVersionAwareValidators(v: DocumentModelFileMakerArgs): string {
  return `
const ${v.phStateName}SchemasByVersion: Record<number, z.ZodType> = ${makeStateSchemasByVersion(v.versions, v.version, v.phStateName)};

const ${v.phDocumentSchemaName}sByVersion: Record<number, z.ZodType> = ${makeDocumentSchemasByVersion(v.versions, v.version, v)};

/** The document model version stamped in a state's document scope. */
function stampedDocumentModelVersion(state: unknown): number | undefined {
  if (typeof state !== "object" || state === null) return undefined;
  const documentScope = (state as { document?: unknown }).document;
  if (typeof documentScope !== "object" || documentScope === null) return undefined;
  const version = (documentScope as { version?: unknown }).version;
  return typeof version === "number" ? version : undefined;
}

function resolve${v.phStateName}Schema(state: unknown): z.ZodType {
  const version = stampedDocumentModelVersion(state);
  const schema = version === undefined ? undefined : ${v.phStateName}SchemasByVersion[version];
  return schema ?? ${v.phStateName}Schema;
}

function resolve${v.phDocumentSchemaName}(document: unknown): z.ZodType {
  const state = typeof document === "object" && document !== null
    ? (document as { state?: unknown }).state
    : undefined;
  const version = stampedDocumentModelVersion(state);
  const schema = version === undefined ? undefined : ${v.phDocumentSchemaName}sByVersion[version];
  return schema ?? ${v.phDocumentSchemaName};
}

/** Simple helper function to check if a state object is a ${v.pascalCaseDocumentType} document state object. Validates against the schema of the version the state is stamped with. */
export function ${v.isPhStateOfTypeFunctionName}(
  state: unknown,
): state is ${v.phStateName} {
  return resolve${v.phStateName}Schema(state).safeParse(state).success;
}

/** Simple helper function to assert that a document state object is a ${v.pascalCaseDocumentType} document state object. Validates against the schema of the version the state is stamped with. */
export function ${v.assertIsPhStateOfTypeFunctionName}(
  state: unknown,
): asserts state is ${v.phStateName} {
  resolve${v.phStateName}Schema(state).parse(state);
}

/** Simple helper function to check if a document is a ${v.pascalCaseDocumentType} document. Validates against the schema of the version the document is stamped with, so documents on older versions remain valid until they are upgraded. */
export function ${v.isPhDocumentOfTypeFunctionName}(
  document: unknown,
): document is ${v.phDocumentTypeName} {
  return resolve${v.phDocumentSchemaName}(document).safeParse(document).success;
}

/** Simple helper function to assert that a document is a ${v.pascalCaseDocumentType} document. Validates against the schema of the version the document is stamped with, so documents on older versions remain valid until they are upgraded. */
export function ${v.assertIsPhDocumentOfTypeFunctionName}(
  document: unknown,
): asserts document is ${v.phDocumentTypeName} {
  resolve${v.phDocumentSchemaName}(document).parse(document);
}
`;
}

function makeSingleVersionValidators(v: DocumentModelFileMakerArgs): string {
  return `
/** Simple helper function to check if a state object is a ${v.pascalCaseDocumentType} document state object */
export function ${v.isPhStateOfTypeFunctionName}(
  state: unknown,
): state is ${v.phStateName} {
  return ${v.phStateName}Schema.safeParse(state).success;
}

/** Simple helper function to assert that a document state object is a ${v.pascalCaseDocumentType} document state object */
export function ${v.assertIsPhStateOfTypeFunctionName}(
  state: unknown,
): asserts state is ${v.phStateName} {
  ${v.phStateName}Schema.parse(state);
}

/** Simple helper function to check if a document is a ${v.pascalCaseDocumentType} document */
export function ${v.isPhDocumentOfTypeFunctionName}(
  document: unknown,
): document is ${v.phDocumentTypeName} {
  return ${v.phDocumentSchemaName}.safeParse(document).success;
}

/** Simple helper function to assert that a document is a ${v.pascalCaseDocumentType} document */
export function ${v.assertIsPhDocumentOfTypeFunctionName}(
  document: unknown,
): asserts document is ${v.phDocumentTypeName} {
  ${v.phDocumentSchemaName}.parse(document);
}
`;
}

export const documentModelDocumentSchemaFileTemplate = (
  v: DocumentModelFileMakerArgs,
) => {
  const olderImports = makeOlderStateSchemaImports(
    v.versions,
    v.version,
    v.phStateName,
  );
  const hasPriorVersions = olderImports.length > 0;
  return ts`
/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import {
  BaseDocumentHeaderSchema,
  BaseDocumentStateSchema,
} from "document-model";
import { z } from "zod";
import { ${v.documentTypeVariableName} } from "./document-type.js";
import { ${v.stateSchemaName} } from "./schema/zod.js";
import type { ${v.phDocumentTypeName}, ${v.phStateName} } from "./types.js";
${hasPriorVersions ? olderImports + "\n" : ""}
/** Schema for validating the header object of a ${v.pascalCaseDocumentType} document */
export const ${v.phDocumentTypeName}HeaderSchema = BaseDocumentHeaderSchema.extend({
  documentType: z.literal(${v.documentTypeVariableName}),
});

/** Schema for validating the state object of a ${v.pascalCaseDocumentType} document */
export const ${v.phStateName}Schema = BaseDocumentStateSchema.extend({
  global: ${v.stateSchemaName}(),
});

export const ${v.phDocumentSchemaName} = z.object({
  header: ${v.phDocumentTypeName}HeaderSchema,
  state: ${v.phStateName}Schema,
  initialState: ${v.phStateName}Schema,
});
${hasPriorVersions ? makeVersionAwareValidators(v) : makeSingleVersionValidators(v)}`
    .raw;
};
