import type { DocumentNode, OperationDefinitionNode } from "graphql";
import { Kind } from "graphql";
import type {
  DocumentModelResultPage,
  JobInfo,
  PhDocumentResultPage,
  Requester,
  Sdk,
} from "./gen/graphql.js";
import type { FetchLike } from "./requester.js";
import { createFetchRequester } from "./requester.js";
import {
  DocumentChangeEventDTO,
  DocumentModelResultPageDTO,
  DocumentWithChildrenDTO,
  JobChangeEventDTO,
  JobInfoDTO,
  MoveChildrenResultDTO,
  PHDocumentDTO,
  PHDocumentResultPageDTO,
} from "./validation.js";

type OperationName = keyof Sdk;
type OperationHandler = (data: Record<string, unknown>) => void;

// This type enforces that ALL operations from Sdk must have a handler
// TypeScript will error if any operation is missing
type OperationValidators = { [K in OperationName]: OperationHandler };

// Validation handlers for each operation
// TypeScript will error if any operation from Sdk is missing
const operationValidators: OperationValidators = {
  GetDocument: (data) => {
    if (data.document) {
      DocumentWithChildrenDTO.parse(data.document);
    }
  },
  GetDocumentModels: (data) => {
    if (data.documentModels) {
      DocumentModelResultPageDTO.parse(
        data.documentModels as DocumentModelResultPage,
      );
    }
  },
  GetDocumentChildren: (data) => {
    if (data.documentChildren) {
      PHDocumentResultPageDTO.parse(
        data.documentChildren as PhDocumentResultPage,
      );
    }
  },
  GetDocumentParents: (data) => {
    if (data.documentParents) {
      PHDocumentResultPageDTO.parse(
        data.documentParents as PhDocumentResultPage,
      );
    }
  },
  FindDocuments: (data) => {
    if (data.findDocuments) {
      PHDocumentResultPageDTO.parse(data.findDocuments as PhDocumentResultPage);
    }
  },
  GetJobStatus: (data) => {
    if (data.jobStatus) {
      JobInfoDTO.parse(data.jobStatus as JobInfo);
    }
  },
  // Mutations
  CreateDocument: (data) => {
    if (data.createDocument) {
      PHDocumentDTO.parse(data.createDocument);
    }
  },
  CreateEmptyDocument: (data) => {
    if (data.createEmptyDocument) {
      PHDocumentDTO.parse(data.createEmptyDocument);
    }
  },
  MutateDocument: (data) => {
    if (data.mutateDocument) {
      PHDocumentDTO.parse(data.mutateDocument);
    }
  },
  MutateDocumentAsync: (data) => {
    if (data.mutateDocumentAsync) {
      // Returns a job ID string
    }
  },
  RenameDocument: (data) => {
    if (data.renameDocument) {
      PHDocumentDTO.parse(data.renameDocument);
    }
  },
  AddChildren: (data) => {
    if (data.addChildren) {
      PHDocumentDTO.parse(data.addChildren);
    }
  },
  RemoveChildren: (data) => {
    if (data.removeChildren) {
      PHDocumentDTO.parse(data.removeChildren);
    }
  },
  MoveChildren: (data) => {
    if (data.moveChildren) {
      MoveChildrenResultDTO.parse(data.moveChildren);
    }
  },
  DeleteDocument: (data) => {
    if (data.deleteDocument !== undefined) {
      // Returns a boolean
    }
  },
  DeleteDocuments: (data) => {
    if (data.deleteDocuments !== undefined) {
      // Returns a boolean
    }
  },
  // Subscriptions
  DocumentChanges: (data) => {
    if (data.documentChanges) {
      DocumentChangeEventDTO.parse(data.documentChanges);
    }
  },
  JobChanges: (data) => {
    if (data.jobChanges) {
      JobChangeEventDTO.parse(data.jobChanges);
    }
  },
  // Sync operations (used inline by reactor/gql-req-channel.ts, not through this SDK)
  PollSyncEnvelopes: () => {},
  TouchChannel: () => {},
  PushSyncEnvelopes: () => {},
};

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
    if (data && operationName && operationName in operationValidators) {
      const validator = operationValidators[operationName as OperationName];
      validator(data as Record<string, unknown>);
    }

    return data;
  };
}
