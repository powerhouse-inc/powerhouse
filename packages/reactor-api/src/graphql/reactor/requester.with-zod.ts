import { Kind, type DocumentNode, type OperationDefinitionNode } from "graphql";
import type {
  DocumentModelResultPage,
  JobInfo,
  PhDocumentResultPage,
  Requester,
} from "./gen/graphql.js";
import { createFetchRequester, type FetchLike } from "./requester.js";
import {
  DocumentModelResultPageDTO,
  DocumentWithChildrenDTO,
  JobInfoDTO,
  PHDocumentResultPageDTO,
} from "./validation.js";

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
            DocumentWithChildrenDTO.parse(dataObj.document);
          }
          break;
        case "GetDocumentModels":
          if (dataObj.documentModels) {
            DocumentModelResultPageDTO.parse(
              dataObj.documentModels as DocumentModelResultPage,
            );
          }
          break;
        case "GetDocumentChildren":
          if (dataObj.documentChildren) {
            PHDocumentResultPageDTO.parse(
              dataObj.documentChildren as PhDocumentResultPage,
            );
          }
          break;
        case "GetDocumentParents":
          if (dataObj.documentParents) {
            PHDocumentResultPageDTO.parse(
              dataObj.documentParents as PhDocumentResultPage,
            );
          }
          break;
        case "FindDocuments":
          if (dataObj.findDocuments) {
            PHDocumentResultPageDTO.parse(
              dataObj.findDocuments as PhDocumentResultPage,
            );
          }
          break;
        case "GetJobStatus":
          if (dataObj.jobStatus) {
            JobInfoDTO.parse(dataObj.jobStatus as JobInfo);
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
