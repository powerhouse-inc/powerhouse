import { Diagnostic } from "@codemirror/lint";
import { isDocumentString } from "@graphql-tools/utils";
import { pascalCase, sentenceCase } from "change-case";
import { parse, Kind } from "graphql";

export function ensureDocumentContainsNodeWithNameAndType(
  doc: string,
  nodeName: string,
  nodeType: keyof typeof Kind,
): boolean {
  if (!doc || !isDocumentString(doc)) return true;

  const parsedDoc = parse(doc);

  return parsedDoc.definitions.some((def) => {
    const hasMatchingType = def.kind === Kind[nodeType];

    return hasMatchingType && "name" in def && def.name?.value === nodeName;
  });
}

export function createNodeTypeAndNameDiagnostic(
  doc: string,
  errorMessage: string,
): Diagnostic | undefined {
  if (!doc || !isDocumentString(doc)) return;

  const parsedDoc = parse(doc);
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
  if (!doc || !isDocumentString(doc)) return [];
  const requiredTypeName = `${pascalCase(modelName)}${scope === "local" ? "Local" : ""}State`;
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
  if (!doc || !isDocumentString(doc)) return [];

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
