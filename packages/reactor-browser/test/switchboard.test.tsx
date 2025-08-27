// test suite for the switchboard hooks

import {
  driveDocumentModelModule,
  generateDocumentStateQueryFields,
} from "document-drive";
import { describe, it } from "vitest";
import {
  buildDocumentSubgraphUrl,
  getDocumentGraphqlQuery,
  getSwitchboardGatewayUrlFromDriveUrl,
} from "../src/utils/switchboard.js";

describe("Switchboard hooks", () => {
  it("should return the proper switchboard url", () => {
    const url = getSwitchboardGatewayUrlFromDriveUrl(
      "https://example.com/d/123",
    );
    expect(url).toBe("https://example.com/graphql");
  });

  it("should generate the proper query for a document type", () => {
    const stateFields = generateDocumentStateQueryFields(
      driveDocumentModelModule.documentModel,
      "document",
    );
    expect(
      getDocumentGraphqlQuery(driveDocumentModelModule.documentModel),
    ).toBe(
      `query getDocument($documentId: PHID!, $driveId: String) {
  DocumentDrive {
    getDocument(docId: $documentId, driveId: $driveId) {
      id
      created
      lastModified
      name
      revision
      state {
        ${stateFields}
      }
    }
  }
}`,
    );
  });

  it("should return the proper switchboard link", () => {
    const url = buildDocumentSubgraphUrl(
      "https://example.com/d/123",
      "test-document",
      driveDocumentModelModule.documentModel,
    );
    expect(url).toBe(
      "https://example.com/graphql/document-drive?explorerURLState=N4IgJg9gxgrgtgUwHYBcQC4QEcYIE4CeABAOYIoAi08yKAFACSSyKoCSY6RACgBJsUAhABoiTPAEsAbgg5cAyiklISASiLAAOkiJEqLWhUkyN23brKVqreszljmNdmFFhjszg-cd1Wned0JMDMAoig8BABDFARg-wCAG0iAZxQAWQgwCQAzCViQgKRIxALzCKkJZIkIJFLdVOiEU3jQosQiJEyEZI0iADoBohqiRxsAfQAxCASwfAA5Lt6gjuKmgGsJJDAiAAdIiNQpmfwiAF9+weHR2kmJBIQF2aXttvXN7evUABUCHaa9g4oI6zPBnMESKA1OpnUqnEJwpCnEDCEBSfYSSIAI3uyQwID8uk04GstA4RK4RJiqQAtJ8UEThCEiW5pB5yUQiQBGABMAGYidokacgA",
    );
  });
});
