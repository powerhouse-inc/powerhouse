import { safeParseSdl } from "#document-model-editor/context/schema-context";
import { type Diagnostic } from "@codemirror/lint";
import { pascalCase, sentenceCase } from "change-case";
import { Kind } from "graphql";

export function ensureDocumentContainsNodeWithNameAndType(
  doc: string,
  nodeName: string,
  nodeType: keyof typeof Kind,
): boolean {
  const parsedDoc = safeParseSdl(doc);

  if (!parsedDoc) return true;

  return parsedDoc.definitions.some((def) => {
    const hasMatchingType = def.kind === Kind[nodeType];

    return hasMatchingType && "name" in def && def.name?.value === nodeName;
  });
}

export function createNodeTypeAndNameDiagnostic(
  doc: string,
  errorMessage: string,
): Diagnostic | undefined {
  const parsedDoc = safeParseSdl(doc);
  if (!parsedDoc) return undefined;

  const firstNode = parsedDoc.definitions[0];

  const nameNode = "name" in firstNode ? firstNode.name : null;

  return {
    from: nameNode?.loc?.start ?? firstNode.loc?.start ?? 0,
    to: nameNode?.loc?.end ?? firstNode.loc?.end ?? 0,
    severity: "error",
    message: errorMessage,
  };
}

export function ensureValidStateSchemaName(
  doc: string,
  modelName: string,
  scope: string,
) {
  if (!safeParseSdl(doc)) return [];
  const scopePascalCase = pascalCase(scope);
  const modelNamePascalCase = pascalCase(modelName);
  const scopeStateTypeNamePrefix =
    scopePascalCase === "Global" ? "" : scopePascalCase;
  const requiredTypeName = `${scopeStateTypeNamePrefix}${modelNamePascalCase}State`;
  if (
    !ensureDocumentContainsNodeWithNameAndType(
      doc,
      requiredTypeName,
      "OBJECT_TYPE_DEFINITION",
    )
  ) {
    return [
      createNodeTypeAndNameDiagnostic(
        doc,
        `${sentenceCase(scope)} state schema must be named ${requiredTypeName}`,
      ),
    ].filter((d) => d !== undefined);
  }

  return [];
}

export function ensureValidOperationSchemaInputName(
  doc: string | undefined,
  operationName: string,
) {
  if (!doc || !safeParseSdl(doc)) return [];

  const requiredTypeName = `${pascalCase(operationName)}Input`;
  if (
    !ensureDocumentContainsNodeWithNameAndType(
      doc,
      requiredTypeName,
      "INPUT_OBJECT_TYPE_DEFINITION",
    )
  ) {
    return [
      createNodeTypeAndNameDiagnostic(
        doc,
        `Operation schema must contain an input type named ${requiredTypeName}`,
      ),
    ].filter((d) => d !== undefined);
  }

  return [];
}
