import { GraphQLReactorClient } from "@powerhousedao/reactor-browser/graphql-client";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  toTransportAction,
  type Action,
  type DocumentModelModule,
  type ISigner,
  type PHDocument,
  type TransportAction,
} from "@powerhousedao/shared/document-model";
import { signFor, testSigner } from "@powerhousedao/shared/testing";
import { documentModelDocumentModelModule } from "document-model";
import type { DriveInfo, PhDocument } from "../types.js";
import { FIND_DOCUMENT_MODELS_QUERY, FIND_DRIVES_QUERY } from "./queries.js";

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

/** The address a load-test client writes as when it is given no signer. */
export const LOAD_TEST_WRITER_ADDRESS =
  "0x00000000000000000000000000000000000010ad";

/** A signer for a load test's writes: a fresh P-256 test key for `address`. */
export function loadTestSigner(
  address: string = LOAD_TEST_WRITER_ADDRESS,
): Promise<ISigner> {
  return testSigner(address, { app: "load-test-client" });
}

/**
 * `actions` signed by `signer` for `documentId`'s `branch`, in the form a
 * GraphQL `ActionInput` takes, for a caller that sends them itself
 * (`execute`, `mutateDocument`): a Switchboard signs no write for its callers.
 */
export async function signedActions(
  signer: ISigner,
  actions: readonly Action[],
  documentId: string,
  branch = "main",
): Promise<TransportAction[]> {
  const signed = await Promise.all(
    actions.map((action) => signFor(signer, action, documentId, branch)),
  );
  return signed.map(toTransportAction);
}

export interface GraphQLClientOptions {
  /** Signs every write; a fresh {@link loadTestSigner} by default. */
  signer?: ISigner;
  /** Models beyond drives and document models the client creates or batches for. */
  documentModels?: readonly DocumentModelModule[];
  /** The `fetch` every request goes through; the global one by default. */
  fetch?: typeof globalThis.fetch;
  /** Bounds each write request, in milliseconds; unset, writes are unbounded. */
  requestTimeoutMs?: number;
}

function phDocumentOf(document: PHDocument): PhDocument {
  return {
    id: document.header.id,
    name: document.header.name,
    documentType: document.header.documentType,
    state: document.state as unknown as Record<string, unknown>,
  };
}

/**
 * The Switchboard as a load test drives it: reads over plain GraphQL, and
 * every write signed by the client's own signer through reactor-browser's
 * `GraphQLReactorClient`, as a Powerhouse client writes. A Switchboard signs
 * no write for its callers.
 */
export class GraphQLClient {
  private readonly writer: GraphQLReactorClient;
  private readonly fetch: typeof globalThis.fetch;

  constructor(
    private url: string,
    options: GraphQLClientOptions = {},
  ) {
    const signer: Promise<ISigner> = options.signer
      ? Promise.resolve(options.signer)
      : loadTestSigner();
    this.fetch = options.fetch ?? ((input, init) => fetch(input, init));
    this.writer = new GraphQLReactorClient({
      url,
      signer: () => signer,
      documentModels: [
        driveDocumentModelModule,
        documentModelDocumentModelModule,
        ...(options.documentModels ?? []),
      ] as DocumentModelModule[],
      realtime: false,
      fetch: this.fetch,
      ...(options.requestTimeoutMs !== undefined
        ? { requestTimeoutMs: options.requestTimeoutMs }
        : {}),
    });
  }

  private async request<T>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<T> {
    const response = await this.fetch(this.url, {
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

  async findDrives(
    type: string = "powerhouse/document-drive",
  ): Promise<DriveInfo[]> {
    const data = await this.request<{
      findDocuments: { items: DriveInfo[] };
    }>(FIND_DRIVES_QUERY, { type });

    return data.findDocuments.items;
  }

  async findDocumentModels(): Promise<{ items: PhDocument[] }> {
    const data = await this.request<{
      findDocuments: { items: PhDocument[] };
    }>(FIND_DOCUMENT_MODELS_QUERY);

    return data.findDocuments;
  }

  /**
   * Creates a document of `documentType`, signed. Under a drive it is filed
   * there too, as a Powerhouse client files it: the drive's `child`
   * relationship and, in a document drive, its ADD_FILE.
   */
  async createEmptyDocument(
    documentType: string,
    parentIdOrSlug?: string,
    name?: string,
  ): Promise<PhDocument> {
    const created = await this.writer.create(
      await this.writer.newDocument(documentType, name ? { name } : undefined),
      parentIdOrSlug,
    );
    const id = created.header.id;

    console.log(`${id} -> CREATE_DOCUMENT`);
    console.log(`${id} -> UPGRADE_DOCUMENT`);
    if (parentIdOrSlug) {
      console.log(`${id} -> filed in ${parentIdOrSlug}`);
    }

    return phDocumentOf(created);
  }

  /** Signs `actions` for the document's main branch and applies them. */
  async mutateDocument(
    documentIdOrSlug: string,
    actions: Action[],
  ): Promise<PhDocument> {
    for (const action of actions) {
      console.log(`${documentIdOrSlug} -> ${action.type}`);
    }

    return phDocumentOf(
      await this.writer.execute(documentIdOrSlug, "main", actions),
    );
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
