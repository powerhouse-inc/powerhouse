// test suite for the switchboard hooks

import {
  buildDocumentSubgraphUrl,
  getDocumentGraphqlQuery,
  getSwitchboardGatewayUrlFromDriveUrl,
} from "@powerhousedao/reactor-browser";
import { describe, it } from "vitest";

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
      documentType
      createdAtUtcIso
      lastModifiedAtUtcIso
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
      "https://example.com/d/123?explorerURLState=N4IgJg9gxgrgtgUwHYBcQC4QEcYIE4CeABAOYIoAi08yKAFACSSyKoCSY6RAyingJZISAQgCURYAB0kRIsxqo6-TkSbVWKDuKkzZe5dL175GgCoEADgkNGiUPAgCGKBGACCKAKooobAM4QNkYANo5+KACyEGD8AGb8rh7evgFBekiOiGmyDgBu-H78EEjZROHOCABS3ADyAHJpAL42jSAANCC5jgKOAEbBCH4YIDqykuDqtBzjXOMu4QC0JrTjbTbjYAK5CNMYROMAjABMAMzj0q2NQA",
    );
  });
});
