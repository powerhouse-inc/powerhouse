// test suite for the switchboard hooks

import {
  buildDocumentSubgraphUrl,
  getDocumentGraphqlQuery,
  getSwitchboardGatewayUrlFromDriveUrl,
} from "@powerhousedao/reactor-browser";
import lzString from "lz-string";
import { describe, it } from "vitest";

// The explorerURLState value is an lz-compressed JSON payload wrapping the
// GetDocumentWithOperations query; decode and assert on its contents rather
// than a hardcoded blob that rots whenever the query document evolves.
function decodeExplorerState(url: string) {
  const state = new URL(url).searchParams.get("explorerURLState");
  expect(state).toBeTruthy();
  return JSON.parse(lzString.decompressFromEncodedURIComponent(state!)) as {
    document: string;
    variables: string;
    headers?: string;
  };
}

describe("Switchboard hooks", () => {
  it("should return the proper switchboard url", () => {
    const url = getSwitchboardGatewayUrlFromDriveUrl(
      "https://example.com/d/123",
    );
    expect(url).toBe("https://example.com/graphql");
  });

  it("should return the proper switchboard link", () => {
    const url = buildDocumentSubgraphUrl(
      "https://example.com/d/123",
      "test-document",
    );

    expect(url.startsWith("https://example.com/d/123?explorerURLState=")).toBe(
      true,
    );

    const payload = decodeExplorerState(url);
    expect(payload.document).toBe(getDocumentGraphqlQuery().trim());
    expect(JSON.parse(payload.variables)).toEqual({
      identifier: "test-document",
    });
    expect(payload.headers).toBeUndefined();
  });

  it("should include an Authorization header when an auth token is given", () => {
    const url = buildDocumentSubgraphUrl(
      "https://example.com/d/123",
      "test-document",
      "tok-123",
    );

    const payload = decodeExplorerState(url);
    expect(JSON.parse(payload.headers!)).toEqual({
      Authorization: "Bearer tok-123",
    });
  });
});
