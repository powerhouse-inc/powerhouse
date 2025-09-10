/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import { GraphQLClient } from "graphql-request";
import {
  toDocumentModelResultPageDTO,
  toDocumentWithChildrenDTO,
  toJobInfoDTO,
  toMoveChildrenResultDTO,
  toPHDocumentDTO,
  toPHDocumentResultPageDTO,
  type TPagingInput,
  type TPropagationMode,
  type TSearchFilterInput,
  type TViewFilterInput,
} from "./dtos.js";
import {
  AddChildrenDocument,
  CreateDocumentDocument,
  CreateEmptyDocumentDocument,
  DeleteDocumentDocument,
  DeleteDocumentsDocument,
  FindDocumentsDocument,
  GetDocumentChildrenDocument,
  GetDocumentDocument,
  GetDocumentModelsDocument,
  GetDocumentParentsDocument,
  GetJobStatusDocument,
  MoveChildrenDocument,
  MutateDocumentAsyncDocument,
  MutateDocumentDocument,
  RemoveChildrenDocument,
  RenameDocumentDocument,
} from "./operations.js";

/**
 * Reactor GraphQL Client
 * Provides type-safe access to the Reactor GraphQL API with runtime validation
 */
export class ReactorGraphQLClient {
  private client: GraphQLClient;

  constructor(url: string, headers?: Record<string, string>) {
    this.client = new GraphQLClient(url, { headers });
  }

  // Query methods
  async getDocumentModels(namespace?: string, paging?: TPagingInput) {
    const data = await this.client.request<any>(GetDocumentModelsDocument, {
      namespace,
      paging,
    });
    return toDocumentModelResultPageDTO(data.documentModels);
  }

  async getDocument(identifier: string, view?: TViewFilterInput) {
    const data = await this.client.request<any>(GetDocumentDocument, {
      identifier,
      view,
    });
    return data.document ? toDocumentWithChildrenDTO(data.document) : null;
  }

  async getDocumentChildren(
    parentIdentifier: string,
    view?: TViewFilterInput,
    paging?: TPagingInput,
  ) {
    const data = await this.client.request<any>(GetDocumentChildrenDocument, {
      parentIdentifier,
      view,
      paging,
    });
    return toPHDocumentResultPageDTO(data.documentChildren);
  }

  async getDocumentParents(
    childIdentifier: string,
    view?: TViewFilterInput,
    paging?: TPagingInput,
  ) {
    const data = await this.client.request<any>(GetDocumentParentsDocument, {
      childIdentifier,
      view,
      paging,
    });
    return toPHDocumentResultPageDTO(data.documentParents);
  }

  async findDocuments(
    search: TSearchFilterInput,
    view?: TViewFilterInput,
    paging?: TPagingInput,
  ) {
    const data = await this.client.request<any>(FindDocumentsDocument, {
      search,
      view,
      paging,
    });
    return toPHDocumentResultPageDTO(data.findDocuments);
  }

  async getJobStatus(jobId: string) {
    const data = await this.client.request<any>(GetJobStatusDocument, {
      jobId,
    });
    return data.jobStatus ? toJobInfoDTO(data.jobStatus) : null;
  }

  // Mutation methods
  async createDocument(document: any, parentIdentifier?: string) {
    const data = await this.client.request<any>(CreateDocumentDocument, {
      document,
      parentIdentifier,
    });
    return toPHDocumentDTO(data.createDocument);
  }

  async createEmptyDocument(documentType: string, parentIdentifier?: string) {
    const data = await this.client.request<any>(CreateEmptyDocumentDocument, {
      documentType,
      parentIdentifier,
    });
    return toPHDocumentDTO(data.createEmptyDocument);
  }

  async mutateDocument(
    documentIdentifier: string,
    actions: any[],
    view?: TViewFilterInput,
  ) {
    const data = await this.client.request<any>(MutateDocumentDocument, {
      documentIdentifier,
      actions,
      view,
    });
    return toPHDocumentDTO(data.mutateDocument);
  }

  async mutateDocumentAsync(
    documentIdentifier: string,
    actions: any[],
    view?: TViewFilterInput,
  ): Promise<string> {
    const data = await this.client.request<any>(MutateDocumentAsyncDocument, {
      documentIdentifier,
      actions,
      view,
    });
    return data.mutateDocumentAsync;
  }

  async renameDocument(
    documentIdentifier: string,
    name: string,
    view?: TViewFilterInput,
  ) {
    const data = await this.client.request<any>(RenameDocumentDocument, {
      documentIdentifier,
      name,
      view,
    });
    return toPHDocumentDTO(data.renameDocument);
  }

  async addChildren(
    parentIdentifier: string,
    documentIdentifiers: string[],
    view?: TViewFilterInput,
  ) {
    const data = await this.client.request<any>(AddChildrenDocument, {
      parentIdentifier,
      documentIdentifiers,
      view,
    });
    return toPHDocumentDTO(data.addChildren);
  }

  async removeChildren(
    parentIdentifier: string,
    documentIdentifiers: string[],
    view?: TViewFilterInput,
  ) {
    const data = await this.client.request<any>(RemoveChildrenDocument, {
      parentIdentifier,
      documentIdentifiers,
      view,
    });
    return toPHDocumentDTO(data.removeChildren);
  }

  async moveChildren(
    sourceParentIdentifier: string,
    targetParentIdentifier: string,
    documentIdentifiers: string[],
    view?: TViewFilterInput,
  ) {
    const data = await this.client.request<any>(MoveChildrenDocument, {
      sourceParentIdentifier,
      targetParentIdentifier,
      documentIdentifiers,
      view,
    });
    return toMoveChildrenResultDTO(data.moveChildren);
  }

  async deleteDocument(identifier: string, propagate?: TPropagationMode) {
    const data = await this.client.request<any>(DeleteDocumentDocument, {
      identifier,
      propagate,
    });
    return data.deleteDocument;
  }

  async deleteDocuments(identifiers: string[], propagate?: TPropagationMode) {
    const data = await this.client.request<any>(DeleteDocumentsDocument, {
      identifiers,
      propagate,
    });
    return data.deleteDocuments;
  }
}
