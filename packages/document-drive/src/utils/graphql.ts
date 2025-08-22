import {
  type DocumentDriveLocalState,
  type FileNode,
  type FolderNode,
} from "#drive-document-model/gen/types";
import { type IBaseDocumentDriveServer } from "#server/types";
import { pascalCase } from "change-case";
import {
  type DocumentModelModule,
  type DocumentModelState,
  type Operation,
  type PHBaseState,
  type PHDocument,
} from "document-model";
import {
  GraphQLError,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLScalarType,
  GraphQLUnionType,
  buildSchema,
  type BuildSchemaOptions,
  type GraphQLOutputType,
  type ParseOptions,
} from "graphql";
import { GraphQLClient, gql } from "graphql-request";
import { logger } from "./logger.js";

export { gql } from "graphql-request";

type ReqGraphQLError = {
  message: string;
};

export type GraphQLResult<T> = { [K in keyof T]: T[K] | null } & {
  errors?: GraphQLError[];
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

export type DriveInfo = {
  id: string;
  name: string;
  slug: string;
  icon?: string;
  meta?: {
    preferredEditor?: string;
  };
};

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
  documentModelState: DocumentModelState,
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
    logger.error(e);
    throw new Error("Couldn't find drive info");
  }

  return drive;
}

export type DriveState = DriveInfo &
  Pick<DocumentDriveLocalState, "availableOffline" | "sharingType"> & {
    nodes: Array<FolderNode | Omit<FileNode, "synchronizationUnits">>;
  };

export type DocumentGraphQLResult<TState extends PHBaseState = PHBaseState> =
  PHDocument<TState> & {
    revision: number;
    state: TState;
    initialState: TState;
    operations: (Operation & {
      inputText: string;
    })[];
  };

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
  const name = pascalCase(documentModel.name);
  const stateFields = generateDocumentStateQueryFields(documentModel, name);
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
    /** @ts-expect-error */
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
    attachments: result.document.attachments,
  };

  return {
    ...result,
    document,
  } as GraphQLResult<{
    document: DocumentGraphQLResult<TState>;
  }>;
}
