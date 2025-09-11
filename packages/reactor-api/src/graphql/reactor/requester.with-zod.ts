import { Kind, type DocumentNode, type OperationDefinitionNode } from "graphql";
import {
  toDocumentModelResultPageDTO,
  toDocumentWithChildrenDTO,
  toJobInfoDTO,
  toPHDocumentResultPageDTO,
} from "./dtos.js";
import type {
  DocumentWithChildren,
  JobInfo,
  Requester,
} from "./generated/graphql.js";
import {
  type DocumentModelResultPage,
  type PhDocumentResultPage,
} from "./operations.js";
import { createFetchRequester, type FetchLike } from "./requester.js";

export function createValidatingRequester(
  url: string,
  fetchImpl: FetchLike,
  headers?: Record<string, string>,
): Requester {
  const base = createFetchRequester(url, fetchImpl, headers);
  return async <R, V>(
    document: DocumentNode,
    variables?: V,
    options?: RequestInit,
  ): Promise<R> => {
    const data = (await base(document, variables, options)) as R;

    // Extract operation name from the document
    const operationDef = document.definitions.find(
      (d): d is OperationDefinitionNode =>
        d.kind === Kind.OPERATION_DEFINITION && !!d.name,
    );
    const operationName = operationDef?.name?.value;

    // Validate based on operation name
    if (data && operationName) {
      const dataObj = data as Record<string, unknown>;
      switch (operationName) {
        case "GetDocument":
          if (dataObj.document) {
            toDocumentWithChildrenDTO(dataObj.document as DocumentWithChildren);
          }
          break;
        case "GetDocumentModels":
          if (dataObj.documentModels) {
            toDocumentModelResultPageDTO(
              dataObj.documentModels as DocumentModelResultPage,
            );
          }
          break;
        case "GetDocumentChildren":
          if (dataObj.documentChildren) {
            toPHDocumentResultPageDTO(
              dataObj.documentChildren as PhDocumentResultPage,
            );
          }
          break;
        case "GetDocumentParents":
          if (dataObj.documentParents) {
            toPHDocumentResultPageDTO(
              dataObj.documentParents as PhDocumentResultPage,
            );
          }
          break;
        case "FindDocuments":
          if (dataObj.findDocuments) {
            toPHDocumentResultPageDTO(
              dataObj.findDocuments as PhDocumentResultPage,
            );
          }
          break;
        case "GetJobStatus":
          if (dataObj.jobStatus) {
            toJobInfoDTO(dataObj.jobStatus as JobInfo);
          }
          break;
        // Mutations and other operations can be added here as needed
        default:
          break;
      }
    }

    return data;
  };
}
