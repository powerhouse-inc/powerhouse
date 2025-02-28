import {
  DocumentDriveLocalState,
  FileNode,
  FolderNode,
} from "#drive-document-model/gen/types";
import { pascalCase } from "change-case";
import {
  DocumentModelModule,
  DocumentModelState,
  OperationFromDocument,
  PHDocument,
} from "document-model";
import {
  BuildSchemaOptions,
  GraphQLError,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLOutputType,
  GraphQLScalarType,
  GraphQLUnionType,
  ParseOptions,
  buildSchema,
} from "graphql";
import request, { GraphQLClient, gql } from "graphql-request";
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
  ...args: Parameters<typeof request>
): Promise<GraphQLResult<T>> {
  const [url, ...requestArgs] = args;
  const client = new GraphQLClient(url, { fetch });
  const { errors, ...response } = await client.request<
    { [K in keyof T]: T[K] | null } & { errors?: ReqGraphQLError[] }
  >(...requestArgs);

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
  meta: {
    preferredEditor: string;
  };
};

function getFields(type: GraphQLOutputType): string {
  if (type instanceof GraphQLObjectType) {
    return Object.entries(type.getFields())
      .map(([fieldName, field]) => {
        const fieldType =
          field.type instanceof GraphQLNonNull ? field.type.ofType : field.type;

        if (
          fieldType instanceof GraphQLObjectType ||
          fieldType instanceof GraphQLUnionType
        ) {
          return `${fieldName} { ${getFields(fieldType)} }`;
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
            return `${fieldName} { ${getFields(listItemType)} }`;
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
        return `... on ${unionType.name} { ${getFields(unionType)} }`;
      })
      .join(" ");
  }
  return "";
}

export function generateDocumentStateQueryFields(
  documentModelState: DocumentModelState,
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

  const queryFields = getFields(stateQuery.type);
  return queryFields;
}

export async function requestPublicDrive(url: string): Promise<DriveInfo> {
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

export type DocumentGraphQLResult<TDocument extends PHDocument> = TDocument & {
  operations: (OperationFromDocument<TDocument> & {
    inputText: string;
  })[];
};

export async function fetchDocument<TDocument extends PHDocument>(
  url: string,
  documentId: string,
  documentModelModule: DocumentModelModule<TDocument>,
): Promise<
  GraphQLResult<{
    document: DocumentGraphQLResult<TDocument>;
  }>
> {
  const { documentModelState, utils } = documentModelModule;
  const stateFields = generateDocumentStateQueryFields(documentModelState);
  const name = pascalCase(documentModelState.name);
  const result = await requestGraphql<{
    document: DocumentGraphQLResult<TDocument>;
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
  const document = result.document
    ? {
        ...result.document,
        revision: {
          global: result.document.revision.global,
          local: 0,
        },
        state: result.document.state,
        operations: {
          global: result.document.operations.map(({ inputText, ...o }) => ({
            ...o,
            error: o.error ?? undefined,
            scope: "global",
            input: JSON.parse(inputText) as PHDocument,
          })),
          local: [],
        },
        attachments: {},
        initialState: utils.createExtendedState({
          // TODO: getDocument should return all the initial state fields
          created: result.document.created,
          lastModified: result.document.created,
          state: utils.createState({
            global: result.document.initialState.state.global,
          }),
        }),
        clipboard: [],
      }
    : null;

  return {
    ...result,
    document,
  } as GraphQLResult<{
    document: DocumentGraphQLResult<TDocument>;
  }>;
}
