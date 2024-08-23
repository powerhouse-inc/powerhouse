import { pascalCase } from 'change-case';
import {
    DocumentDriveLocalState,
    FileNode,
    FolderNode
} from 'document-model-libs/document-drive';
import { Document } from 'document-model/document';
import { DocumentModelState } from 'document-model/document-model';
import {
    BuildSchemaOptions,
    GraphQLList,
    GraphQLNonNull,
    GraphQLObjectType,
    GraphQLOutputType,
    GraphQLScalarType,
    GraphQLUnionType,
    ParseOptions,
    buildSchema
} from 'graphql';
import request, { GraphQLClient, gql } from 'graphql-request';
import { logger } from './logger';

export type DriveInfo = {
    id: string;
    name: string;
    slug: string;
    icon?: string;
};

function getFields(type: GraphQLOutputType): string {
    if (type instanceof GraphQLObjectType) {
        return Object.entries(type.getFields())
            .map(([fieldName, field]) => {
                const fieldType =
                    field.type instanceof GraphQLNonNull
                        ? field.type.ofType
                        : field.type;

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
                            `List item type ${listItemType.toString()} is not handled`
                        );
                    }
                }

                return fieldName;
            })
            .join(' ');
    } else if (type instanceof GraphQLUnionType) {
        return type
            .getTypes()
            .map(unionType => {
                return `... on ${unionType.name} { ${getFields(unionType)} }`;
            })
            .join(' ');
    }
    return '';
}

export function generateDocumentStateQuery(
    documentModel: DocumentModelState,
    options?: BuildSchemaOptions & ParseOptions
): string {
    const name = pascalCase(documentModel.name);
    const spec = documentModel.specifications.at(-1);
    if (!spec) {
        throw new Error('No document model specification found');
    }
    const source = `${spec.state.global.schema} type Query { ${name}: ${name}State }`;
    const schema = buildSchema(source, options);
    const queryType = schema.getQueryType();
    if (!queryType) {
        throw new Error('No query type found');
    }
    const fields = queryType.getFields();
    const stateQuery = fields[name];

    if (!stateQuery) {
        throw new Error('No state query found');
    }

    const queryFields = getFields(stateQuery.type);
    return `... on ${name} { state { ${queryFields} }`;
}

// replaces fetch so it can be used in Node and Browser envs
export async function requestGraphql<T>(...args: Parameters<typeof request>) {
    const [url, ...requestArgs] = args;
    const client = new GraphQLClient(url, { fetch });
    return client.request<T>(...requestArgs);
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
                    }
                }
            `
        );
        drive = result.drive;
    } catch (e) {
        logger.error(e);
        throw new Error("Couldn't find drive info");
    }

    if (!drive) {
        throw new Error('Drive not found');
    }

    return drive;
}

export type DriveState = DriveInfo &
    Pick<DocumentDriveLocalState, 'availableOffline' | 'sharingType'> & {
        nodes: Array<FolderNode | Omit<FileNode, 'synchronizationUnits'>>;
    };

export async function fetchDocumentState<D extends Document>(
    url: string,
    documentId: string,
    documentModel?: DocumentModelState
): Promise<Omit<D, 'operations'>> {
    const stateFields = documentModel
        ? generateDocumentStateQuery(documentModel)
        : undefined;
    const result = await requestGraphql<{ document: D }>(
        url,
        gql`
            query ($id: String!) {
                document(id: $id) {
                    id
                    name
                    ${
                        stateFields
                            ? `state {
                        ${stateFields}
                    }`
                            : ''
                    }
                }
            }
        `,
        { id: documentId }
    );
    return result.document;
}
