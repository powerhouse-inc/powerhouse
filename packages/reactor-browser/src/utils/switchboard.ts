import { pascalCase } from "change-case";
import type { DocumentModelModule } from "document-model";
import {
  Kind,
  parse,
  type DefinitionNode,
  type ObjectTypeDefinitionNode,
  type TypeNode,
} from "graphql";
import lzString from "lz-string";
import { GQL_CHANNEL_SUFFIX } from "../ai/switchboard.js";
import { GetDocumentWithOperationsDocument } from "../graphql/gen/schema.js";

export async function getDriveIdBySlug(driveUrl: string, slug: string) {
  if (!driveUrl) {
    return;
  }

  const urlParts = driveUrl.split("/");
  urlParts.pop(); // remove id
  urlParts.pop(); // remove /d
  urlParts.push("drives"); // add /drives
  const drivesUrl = urlParts.join("/");
  const result = await fetch(drivesUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `
                        query getDriveIdBySlug($slug: String!) {
                            driveIdBySlug(slug: $slug)
                        }
                    `,
      variables: {
        slug,
      },
    }),
  });

  const data = (await result.json()) as {
    data: { driveIdBySlug: string };
  };

  return data.data.driveIdBySlug;
}

export function getSlugFromDriveUrl(driveUrl: string) {
  const urlParts = driveUrl.split("/");
  return urlParts.pop();
}

export function getSwitchboardGatewayUrlFromDriveUrl(driveUrl: string) {
  const urlParts = driveUrl.split("/");
  urlParts.pop(); // remove id
  urlParts.pop(); // remove /d
  urlParts.push("graphql"); // add /graphql
  return urlParts.join("/");
}

export function getDocumentGraphqlQuery() {
  const loc = GetDocumentWithOperationsDocument.loc;
  if (!loc) {
    throw new Error(
      "GetDocumentWithOperationsDocument is misconfigured, loc is missing.",
    );
  }
  return loc.source.body;
}

/**
 * The base URL of the switchboard that serves a drive's GraphQL channel.
 *
 * The channel URL is `<origin>[<proxy-prefix>]/graphql/r`, so stripping the
 * suffix preserves any proxy prefix (e.g. `/api/reactor`). A URL that does
 * not end with the suffix is unexpected — fall back to its origin.
 */
export function getSwitchboardBaseFromChannelUrl(channelUrl: string): string {
  if (channelUrl.endsWith(GQL_CHANNEL_SUFFIX)) {
    return channelUrl.slice(0, -GQL_CHANNEL_SUFFIX.length);
  }
  return new URL(channelUrl).origin;
}

/**
 * The GraphQL name the switchboard exposes a document model under. Mirrors
 * `getDocumentModelSchemaName` on the server (`create-schema.ts`): the root
 * query field and the state type names are all derived from the model's
 * `global.name`.
 */
function getDocumentModelSchemaName(model: DocumentModelModule): string {
  return pascalCase(model.documentModel.global.name.replaceAll("/", " "));
}

function buildStateTypeMap(definitions: ReadonlyArray<DefinitionNode>) {
  const typeMap = new Map<string, ObjectTypeDefinitionNode>();
  for (const def of definitions) {
    if (def.kind === Kind.OBJECT_TYPE_DEFINITION) {
      typeMap.set(def.name.value, def);
    }
  }
  return typeMap;
}

/**
 * Recursively expands the fields of a state object type into a GraphQL
 * selection. Objects expand their sub-selection (lists expand their item
 * type); enums, scalars, and built-ins are leaves.
 */
function expandStateFields(
  typeDef: ObjectTypeDefinitionNode,
  typeMap: Map<string, ObjectTypeDefinitionNode>,
): string {
  return (typeDef.fields ?? [])
    .map((field) => {
      const fieldName = field.name.value;
      let typeNode: TypeNode = field.type;
      if (typeNode.kind === Kind.NON_NULL_TYPE) {
        typeNode = typeNode.type;
      }

      if (typeNode.kind === Kind.LIST_TYPE) {
        let itemType: TypeNode = typeNode.type;
        if (itemType.kind === Kind.NON_NULL_TYPE) {
          itemType = itemType.type;
        }
        if (itemType.kind === Kind.LIST_TYPE) {
          throw new Error(
            `Nested lists are not supported in state selections: ${fieldName}`,
          );
        }
        if (itemType.kind !== Kind.NAMED_TYPE) {
          return fieldName;
        }
        const itemTypeDef = typeMap.get(itemType.name.value);
        if (!itemTypeDef) {
          // Scalar, enum, or built-in item — a leaf.
          return fieldName;
        }
        return `${fieldName} { ${expandStateFields(itemTypeDef, typeMap)} }`;
      }

      if (typeNode.kind !== Kind.NAMED_TYPE) {
        return fieldName;
      }
      const typeDef = typeMap.get(typeNode.name.value);
      if (!typeDef) {
        // Scalar, enum, or a type from another schema — a leaf.
        return fieldName;
      }
      return `${fieldName} { ${expandStateFields(typeDef, typeMap)} }`;
    })
    .join(" ");
}

/**
 * Finds the root state object type in a state SDL. Root state types follow
 * the `<Name>State` / `<Name>GlobalState` conventions, and are defined last
 * by convention — the same resolution order the server uses
 * (`extractRootTypeName` in `create-schema.ts`).
 */
function findRootStateType(
  definitions: ReadonlyArray<DefinitionNode>,
  candidates: string[],
): ObjectTypeDefinitionNode {
  let lastObjectType: ObjectTypeDefinitionNode | null = null;
  for (const def of definitions) {
    if (def.kind !== Kind.OBJECT_TYPE_DEFINITION) {
      continue;
    }
    if (candidates.includes(def.name.value)) {
      return def;
    }
    lastObjectType = def;
  }
  if (!lastObjectType) {
    throw new Error("No root state type found in the document model schema");
  }
  return lastObjectType;
}

/**
 * Derives the subselection for the document's `global` state scope from the
 * model's state SDL (e.g. `name total`), expanding object fields
 * recursively. Throws when the schema is missing, unparseable, or has no
 * root object type — the caller falls back to the generic document query.
 */
export function getDocumentStateSelection(model: DocumentModelModule): string {
  const spec = model.documentModel.global.specifications.at(-1);
  const schema = spec?.state.global.schema;
  if (!schema || !schema.trim()) {
    throw new Error("Document model has no global state schema");
  }
  const ast = parse(schema);
  const typeMap = buildStateTypeMap(ast.definitions);
  const documentName = getDocumentModelSchemaName(model);
  const rootType = findRootStateType(ast.definitions, [
    `${documentName}State`,
    `${documentName}GlobalState`,
  ]);
  return expandStateFields(rootType, typeMap);
}

function getLocalStateSelection(
  localSchema: string,
  documentName: string,
): string {
  const ast = parse(localSchema);
  const typeMap = buildStateTypeMap(ast.definitions);
  const rootType = findRootStateType(ast.definitions, [
    `${documentName}LocalState`,
  ]);
  return expandStateFields(rootType, typeMap);
}

/**
 * Builds a query scoped to a document type's own subgraph root field,
 * selecting the document and its full typed state. The shape mirrors what
 * the switchboard generates per model (`generateNewApiSchema` in
 * `create-schema.ts`): `<Name> { document(identifier:) { document { ...
 * state { auth document global local } } } childIds }`.
 */
function buildModelScopedQuery(model: DocumentModelModule): string {
  const globalState = model.documentModel.global;
  const documentName = getDocumentModelSchemaName(model);
  const globalSelection = getDocumentStateSelection(model);

  const spec = globalState.specifications.at(-1);
  const localSchema = spec?.state.local.schema ?? "";
  const hasLocalStateType = localSchema.includes(
    `type ${documentName}LocalState`,
  );
  const localSelection = hasLocalStateType
    ? getLocalStateSelection(localSchema, documentName)
    : null;

  return [
    "query GetDocument($identifier: String!) {",
    `  ${documentName} {`,
    "    document(identifier: $identifier) {",
    "      document {",
    "        id",
    "        name",
    "        documentType",
    "        state {",
    "          auth",
    "          document { version hash { algorithm encoding } isDeleted deletedAtUtcIso deletedBy deletionReason }",
    `          global { ${globalSelection} }`,
    `          ${localSelection ? `local { ${localSelection} }` : "local"}`,
    "        }",
    "      }",
    "      childIds",
    "    }",
    "  }",
    "}",
  ].join("\n");
}

export function buildDocumentSubgraphQuery(
  documentType: string,
  identifier: string,
  model?: DocumentModelModule,
  authToken?: string,
): string {
  let query: string;
  // Only trust a model that actually matches the document's type; a model
  // with a different root field would produce a query the supergraph cannot
  // resolve.
  if (model && model.documentModel.global.id === documentType) {
    try {
      query = buildModelScopedQuery(model);
    } catch (error) {
      console.warn(
        "Could not derive a document-scoped query from the document model, " +
          "falling back to the generic document query:",
        error,
      );
      query = getDocumentGraphqlQuery();
    }
  } else {
    query = getDocumentGraphqlQuery();
  }
  const variables = { identifier };
  const headers = authToken
    ? {
        Authorization: `Bearer ${authToken}`,
      }
    : undefined;

  const payload: Record<string, string> = {
    document: query.trim(),
    variables: JSON.stringify(variables, null, 2),
  };
  if (headers) {
    payload.headers = JSON.stringify(headers);
  }
  return lzString.compressToEncodedURIComponent(JSON.stringify(payload));
}

export function buildDocumentSubgraphUrl(
  channelUrl: string,
  documentType: string,
  identifier: string,
  model?: DocumentModelModule,
  authToken?: string,
): string {
  const encodedQuery = buildDocumentSubgraphQuery(
    documentType,
    identifier,
    model,
    authToken,
  );
  const base = getSwitchboardBaseFromChannelUrl(channelUrl);
  return `${base}/explorer?explorerURLState=${encodedQuery}`;
}
