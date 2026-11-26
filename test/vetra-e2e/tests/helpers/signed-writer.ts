// A switchboard signs no write for its callers: what a spec writes to one
// over GraphQL, it writes as a signer of its own, as a Powerhouse client does.
import { GraphQLReactorClient } from "@powerhousedao/reactor-browser/graphql-client";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type { Action } from "@powerhousedao/shared/document-model";
import { testSigner } from "@powerhousedao/shared/testing";
import { documentModelDocumentModelModule } from "document-model";

export const E2E_WRITER_ADDRESS = "0x00000000000000000000000000000000000000e2";

export type SignedWriter = {
  /** A document of `documentType`, under `parentId` when given; its id. */
  create(documentType: string, parentId?: string): Promise<string>;
  /** Signs `actions` for `documentId`'s main branch and applies them. */
  execute(documentId: string, actions: Action[]): Promise<void>;
};

/** Writes to the switchboard GraphQL endpoint `graphqlUrl`, signed. */
export async function signedWriter(graphqlUrl: string): Promise<SignedWriter> {
  const client = new GraphQLReactorClient({
    url: graphqlUrl,
    signer: await testSigner(E2E_WRITER_ADDRESS, { app: "vetra-e2e" }),
    documentModels: [
      driveDocumentModelModule,
      documentModelDocumentModelModule,
    ],
    realtime: false,
  });
  return {
    async create(documentType, parentId) {
      const created = await client.create(
        await client.newDocument(documentType),
        parentId,
      );
      return created.header.id;
    },
    async execute(documentId, actions) {
      await client.execute(documentId, "main", actions);
    },
  };
}
