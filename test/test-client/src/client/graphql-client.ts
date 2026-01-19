import type { Action } from "document-model";
import type { DriveInfo, PhDocument } from "../types.js";
import {
  CREATE_EMPTY_DOCUMENT_MUTATION,
  FIND_DRIVES_QUERY,
  MUTATE_DOCUMENT_MUTATION,
} from "./queries.js";

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

export class GraphQLClient {
  constructor(private url: string) {}

  private async request<T>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<T> {
    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
    }

    const result = (await response.json()) as GraphQLResponse<T>;

    if (result.errors && result.errors.length > 0) {
      throw new Error(
        `GraphQL errors: ${result.errors.map((e) => e.message).join(", ")}`,
      );
    }

    if (!result.data) {
      throw new Error("No data in GraphQL response");
    }

    return result.data;
  }

  async findDrives(): Promise<DriveInfo[]> {
    const data = await this.request<{
      findDocuments: { items: DriveInfo[] };
    }>(FIND_DRIVES_QUERY);

    return data.findDocuments.items;
  }

  async createEmptyDocument(
    documentType: string,
    parentIdentifier?: string,
  ): Promise<PhDocument> {
    const data = await this.request<{
      createEmptyDocument: PhDocument;
    }>(CREATE_EMPTY_DOCUMENT_MUTATION, {
      documentType,
      parentIdentifier,
    });

    return data.createEmptyDocument;
  }

  async mutateDocument(
    documentIdentifier: string,
    actions: Action[],
  ): Promise<PhDocument> {
    const data = await this.request<{
      mutateDocument: PhDocument;
    }>(MUTATE_DOCUMENT_MUTATION, {
      documentIdentifier,
      actions,
    });

    return data.mutateDocument;
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.findDrives();
      return true;
    } catch {
      return false;
    }
  }
}
