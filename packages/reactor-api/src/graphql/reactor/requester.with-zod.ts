import type { DocumentNode } from "graphql";
import {
  toDocumentModelResultPageDTO,
  toDocumentWithChildrenDTO,
  toJobInfoDTO,
  toPHDocumentResultPageDTO,
} from "./dtos.js";
import type { Requester } from "./generated/sdk.js";
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
    options?: any,
  ): Promise<R> => {
    const data = (await base(document, variables, options)) as R;

    // Extract operation name from the document
    const operationDef = document.definitions.find(
      (d): d is any => d.kind === "OperationDefinition" && !!d.name,
    );
    const operationName = operationDef?.name?.value;

    // Validate based on operation name
    if (data && operationName) {
      switch (operationName) {
        case "GetDocument":
          if ((data as any).document) {
            toDocumentWithChildrenDTO((data as any).document);
          }
          break;
        case "GetDocumentModels":
          if ((data as any).documentModels) {
            toDocumentModelResultPageDTO((data as any).documentModels);
          }
          break;
        case "GetDocumentChildren":
          if ((data as any).documentChildren) {
            toPHDocumentResultPageDTO((data as any).documentChildren);
          }
          break;
        case "GetDocumentParents":
          if ((data as any).documentParents) {
            toPHDocumentResultPageDTO((data as any).documentParents);
          }
          break;
        case "FindDocuments":
          if ((data as any).findDocuments) {
            toPHDocumentResultPageDTO((data as any).findDocuments);
          }
          break;
        case "GetJobStatus":
          if ((data as any).jobStatus) {
            toJobInfoDTO((data as any).jobStatus);
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
