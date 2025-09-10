// test suite for the switchboard hooks

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
    expect(getDocumentGraphqlQuery()).toBe(
      `query getDocument($documentId: String!) {
  document(id: $documentId) {
      id
      lastModified
      name
      revision
      stateJSON
    }
  }`,
    );
  });

  it("should return the proper switchboard link", () => {
    const url = buildDocumentSubgraphUrl(
      "https://example.com/d/123",
      "test-document",
    );
    expect(url).toBe(
      "https://example.com/d/123?explorerURLState=N4IgJg9gxgrgtgUwHYBcQC4QEcYIE4CeABAOYIoAi08yKAFACSSyKoCSY6RAyingJZISAQgCURYAB0kRIsxqo6-TkSbVWKDuKkzZe5dL16ANgEMAzigCyEMPwBm-BGENGiSU4ldG8CAG785vwQSN56lqYoCABS3ADyAHJhAL6uySAANCB+pgKmAEbGCOYYIDqykuDqtByVXJVRlgC08hqVGa6VYAJ+CLUYRJUAjABMAMyV0unJQA",
    );
  });
});
