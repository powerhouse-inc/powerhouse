import { pascalCase } from "change-case";
import type {
  DocumentGraphQLResult,
  DriveInfo,
  GraphQLResult,
  IBaseDocumentDriveServer,
} from "document-drive";
import type {
  DocumentModelGlobalState,
  DocumentModelModule,
  PHBaseState,
  PHDocument,
} from "document-model";
import type {
  BuildSchemaOptions,
  GraphQLOutputType,
  ParseOptions,
} from "graphql";
import {
  GraphQLError,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLScalarType,
  GraphQLUnionType,
  buildSchema,
} from "graphql";
import { GraphQLClient, gql } from "graphql-request";
import { logger } from "./logger.js";

export { gql } from "graphql-request";

type ReqGraphQLError = {
  message: string;
};

// replaces fetch so it can be used in Node and Browser envs
export async function requestGraphql<T>(
  url: string,
  document: string,
  variables?: Record<string, unknown>,
  headers?: Record<string, string>,
): Promise<GraphQLResult<T>> {
  const client = new GraphQLClient(url, {
    fetch,
    headers: headers || {},
  });
  const { errors, ...response } = await client.request<
    { [K in keyof T]: T[K] | null } & { errors?: ReqGraphQLError[] }
  >(document, variables);

  const result = { ...response } as GraphQLResult<T>;
  if (errors?.length) {
    result.errors = errors.map(
      ({ message, ...options }) => new GraphQLError(message, options),
    );
  }
  return result;
}

function getFields(type: GraphQLOutputType, prefix: string): string {
  if (type instanceof GraphQLObjectType) {
    return Object.entries(type.getFields())
      .map(([fieldName, field]) => {
        const fieldType =
          field.type instanceof GraphQLNonNull ? field.type.ofType : field.type;

        if (
          fieldType instanceof GraphQLObjectType ||
          fieldType instanceof GraphQLUnionType
        ) {
          return `${fieldName} { ${getFields(fieldType, prefix)} }`;
        }

        if (fieldType instanceof GraphQLList) {
          const listItemType =
            fieldType.ofType instanceof GraphQLNonNull
              ? fieldType.ofType.ofType
              : fieldType.ofType;

          if (listItemType instanceof GraphQLScalarType) {
            return fieldName;
          } else if (
            listItemType instanceof GraphQLObjectType ||
            listItemType instanceof GraphQLUnionType
          ) {
            return `${fieldName} { ${getFields(listItemType, prefix)} }`;
          } else {
            throw new Error(
              `List item type ${listItemType.toString()} is not handled`,
            );
          }
        }

        return fieldName;
      })
      .join(" ");
  } else if (type instanceof GraphQLUnionType) {
    return type
      .getTypes()
      .map((unionType) => {
        return `... on ${prefix ? `${prefix}_` : ""}${unionType.name} { ${getFields(unionType, prefix)} }`;
      })
      .join(" ");
  }
  return "";
}

export function generateDocumentStateQueryFields(
  documentModelState: DocumentModelGlobalState,
  prefix: string,
  options?: BuildSchemaOptions & ParseOptions,
): string {
  const name = pascalCase(documentModelState.name);
  const spec = documentModelState.specifications.at(-1);
  if (!spec) {
    throw new Error("No document model specification found");
  }
  const source = `${spec.state.global.schema} type Query { ${name}: ${name}State }`;
  const schema = buildSchema(source, options);
  const queryType = schema.getQueryType();
  if (!queryType) {
    throw new Error("No query type found");
  }
  const fields = queryType.getFields();
  const stateQuery = fields[name];

  if (!stateQuery) {
    throw new Error("No state query found");
  }

  const queryFields = getFields(stateQuery.type, prefix);
  return queryFields;
}

export async function requestPublicDriveWithTokenFromReactor(
  url: string,
  server: IBaseDocumentDriveServer,
): Promise<DriveInfo> {
  const token = await server.generateJwtHandler?.(url);
  const headers: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : {};
  return requestPublicDrive(url, headers);
}

export async function requestPublicDrive(
  url: string,
  headers?: Record<string, string>,
): Promise<DriveInfo> {
  let drive: DriveInfo;
  try {
    const result = await requestGraphql<{ drive: DriveInfo }>(
      url,
      gql`
        query getDrive {
          drive {
            id
            name
            icon
            slug
            meta {
              preferredEditor
            }
          }
        }
      `,
      undefined,
      headers,
    );
    if (result.errors?.length || !result.drive) {
      throw result.errors?.at(0) ?? new Error("Drive not found");
    }
    drive = result.drive;
  } catch (e) {
    logger.error("@error", e);
    throw new Error("Couldn't find drive info");
  }

  return drive;
}

export async function requestPublicDriveFromReactor(
  url: string,
  headers?: Record<string, string>,
): Promise<DriveInfo> {
  // Extract driveId from URL (e.g., "http://localhost:4001/d/abc123" -> "abc123")
  const driveId = url.split("/").pop() ?? "";

  // Construct the new reactor subgraph URL from the base URL
  // e.g., "http://localhost:4001/d/abc123" -> "http://localhost:4001/graphql/r"
  const parsedUrl = new URL(url);
  const reactorGraphqlUrl = `${parsedUrl.protocol}//${parsedUrl.host}/graphql/r`;

  let drive: DriveInfo;
  try {
    const result = await requestGraphql<{
      document: {
        document: {
          id: string;
          name: string;
          slug: string | null;
          state: Record<string, unknown>;
        };
      } | null;
    }>(
      reactorGraphqlUrl,
      gql`
        query getDocument($identifier: String!) {
          document(identifier: $identifier) {
            document {
              id
              name
              slug
              state
            }
          }
        }
      `,
      { identifier: driveId },
      headers,
    );

    if (result.errors?.length || !result.document?.document) {
      throw result.errors?.at(0) ?? new Error("Drive not found");
    }

    const doc = result.document.document;
    const globalState = (
      doc.state as {
        global?: { icon?: string; meta?: { preferredEditor?: string } };
      }
    ).global;

    // Transform PHDocument to DriveInfo shape
    drive = {
      id: doc.id,
      name: doc.name,
      slug: doc.slug ?? "",
      icon: globalState?.icon,
      meta: globalState?.meta,
    };
  } catch (e) {
    logger.error("@error", e);
    throw new Error("Couldn't find drive info");
  }

  return drive;
}

export async function fetchDocument<TState extends PHBaseState = PHBaseState>(
  url: string,
  documentId: string,
  documentModelModule: DocumentModelModule<TState>,
): Promise<
  GraphQLResult<{
    document: DocumentGraphQLResult<TState>;
  }>
> {
  const { documentModel } = documentModelModule;
  const name = pascalCase(documentModel.global.name);
  const stateFields = generateDocumentStateQueryFields(
    documentModel.global,
    name,
  );
  const result = await requestGraphql<{
    document: DocumentGraphQLResult<TState>;
  }>(
    url,
    gql`
            query ($id: String!) {
                document(id: $id) {
                    id
                    name
                    created
                    documentType
                    lastModified
                    revision
                    operations {
                        id
                        error
                        hash
                        index
                        skip
                        timestamp
                        type
                        inputText
                        context {
                            signer {
                                user {
                                    address
                                    networkId
                                    chainId
                                }
                                app {
                                    name
                                    key
                                }
                                signatures
                            }
                        }
                    }
                    ... on ${name} {
                        state {
                            ${stateFields}
                        }
                        initialState {
                            ${stateFields}
                        }
                    }
                }
            }
        `,
    { id: documentId },
  );

  if (!result.document) {
    return { ...result, document: null };
  }

  const document: DocumentGraphQLResult<TState> = {
    clipboard: result.document.clipboard,
    header: result.document.header,
    initialState: result.document.initialState,
    /** @ts-expect-error TODO: fix this */
    operations: {
      global: result.document.operations.map(({ inputText, ...o }) => ({
        ...o,
        error: o.error ?? undefined,
        scope: "global",
        input: JSON.parse(inputText) as PHDocument<TState>,
      })),
      local: [],
    },
    state: result.document.state,
  };

  return {
    ...result,
    document,
  } as GraphQLResult<{
    document: DocumentGraphQLResult<TState>;
  }>;
}
