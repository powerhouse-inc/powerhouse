import { camelCase, kebabCase } from "change-case";
import { addFile, type IDocumentDriveServer } from "document-drive";
import { setName, type DocumentModelModule } from "document-model";
import {
  generateDocumentModelSchemaLegacy,
  getDocumentModelSchemaName,
} from "../utils/create-schema.js";
import { BaseSubgraph } from "./base-subgraph.js";
import type { SubgraphArgs } from "./types.js";
import { buildGraphQlDocument } from "./utils.js";

export function generateDocumentModelResolversLegacy(
  documentModel: DocumentModelModule,
  reactor: IDocumentDriveServer,
) {
  const documentType = documentModel.documentModel.global.id;
  const documentName = getDocumentModelSchemaName(
    documentModel.documentModel.global,
  );
  const operations =
    documentModel.documentModel.global.specifications
      .at(-1)
      ?.modules.flatMap((module) =>
        module.operations.filter((op) => op.name),
      ) ?? [];

  return {
    Query: {
      [documentName]: () => {
        return {
          getDocument: async (args: { docId: string; driveId: string }) => {
            const { docId, driveId } = args;

            if (!docId) {
              throw new Error("Document id is required");
            }

            if (driveId) {
              const docIds = await reactor.getDocuments(driveId);
              if (!docIds.includes(docId)) {
                throw new Error(
                  `Document with id ${docId} is not part of ${driveId}`,
                );
              }
            }

            const doc = await reactor.getDocument(docId);
            if (doc.header.documentType !== documentType) {
              throw new Error(
                `Document with id ${docId} is not of type ${documentType}`,
              );
            }

            return {
              driveId: driveId,
              ...buildGraphQlDocument(doc),
            };
          },
          getDocuments: async (args: { driveId: string }) => {
            const { driveId } = args;
            const docsIds = await reactor.getDocuments(driveId);
            const docs = await Promise.all(
              docsIds.map(async (docId) => {
                const doc = await reactor.getDocument(docId);
                return {
                  driveId: driveId,
                  ...buildGraphQlDocument(doc),
                };
              }),
            );

            return docs.filter((doc) => doc.documentType === documentType);
          },
        };
      },
    },
    Mutation: {
      [`${documentName}_createDocument`]: async (
        _: unknown,
        args: { name: string; driveId?: string },
      ) => {
        const { driveId, name } = args;
        const document = await reactor.addDocument(documentType);

        if (driveId) {
          await reactor.addAction(
            driveId,
            addFile({
              name,
              id: document.header.id,
              documentType: documentType,
            }),
          );
        }

        if (name) {
          await reactor.addAction(document.header.id, setName(name));
        }

        return document.header.id;
      },
      ...operations.reduce(
        (mutations, op) => {
          mutations[`${documentName}_${camelCase(op.name!)}`] = async (
            _: unknown,
            args: { docId: string; input: unknown },
          ) => {
            const { docId, input } = args;
            const doc = await reactor.getDocument(docId);
            if (!doc) {
              throw new Error("Document not found");
            }

            const action = documentModel.actions[camelCase(op.name!)];
            if (!action) {
              throw new Error(`Action ${op.name} not found`);
            }

            const result = await reactor.addAction(docId, action(input));

            if (result.status !== "SUCCESS") {
              throw new Error(result.error?.message ?? `Failed to ${op.name}`);
            }

            const errorOp = result.operations.find((op) => op.error);
            if (errorOp) {
              throw new Error(errorOp.error);
            }

            return true;
          };
          return mutations;
        },
        {} as Record<string, any>,
      ),
    },
  };
}

export class DocumentModelSubgraphLegacy extends BaseSubgraph {
  private documentModel: DocumentModelModule;

  constructor(documentModel: DocumentModelModule, args: SubgraphArgs) {
    super(args);
    this.documentModel = documentModel;
    this.name = kebabCase(documentModel.documentModel.global.name);
    this.typeDefs = generateDocumentModelSchemaLegacy(
      this.documentModel.documentModel.global,
    );
    this.resolvers = generateDocumentModelResolversLegacy(
      this.documentModel,
      args.reactor,
    );
  }
}
