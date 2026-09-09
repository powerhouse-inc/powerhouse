/**
 * End-to-end coverage for the GraphiQL explorer's `explorerURLState` prefill:
 * the document toolbar in Connect builds a switchboard explorer URL carrying
 * an lz-string-compressed payload (see `buildDocumentSubgraphQuery` in
 * @powerhousedao/reactor-browser). The switchboard decodes it and embeds the
 * query/variables as the page's defaultQuery.
 *
 * This test exercises the real server process (the built reactor-api dist),
 * which matters: the payload is compressed with the CJS lz-string package,
 * whose runtime shape under plain Node ESM differs from what vite/vitest
 * interop provides.
 */
import { createRequire } from "node:module";
import type * as LzString from "lz-string";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
// CJS require bypasses ESM namespace interop: this is the exact object the
// browser-side builder (and the server's decoder) operate on.
const lzString = require("lz-string") as typeof LzString;

const GRAPHQL_URL =
  process.env.SWITCHBOARD_URL ?? "http://localhost:4001/graphql";
const BASE_URL = GRAPHQL_URL.replace(/\/graphql$/, "");

const DOC_ID = "0d9f1c8a-5e6b-4c2d-8f3a-1b2c3d4e5f60";

/** Mirrors the payload shape of `buildDocumentSubgraphQuery`. */
function buildExplorerUrl(): string {
  const document = `query GetDocument($identifier: String!) {
  TodoList {
    document(identifier: $identifier) {
      document {
        id
        name
        documentType
      }
      childIds
    }
  }
}`;
  const payload = {
    document,
    variables: JSON.stringify({ identifier: DOC_ID }, null, 2),
  };
  return `${BASE_URL}/explorer?explorerURLState=${lzString.compressToEncodedURIComponent(
    JSON.stringify(payload),
  )}`;
}

describe("GraphiQL explorer prefill", () => {
  it("serves the page with the decoded document-scoped query and variables", async () => {
    const res = await fetch(buildExplorerUrl());
    expect(res.status).toBe(200);
    const html = await res.text();

    // The decoded query is embedded as the page's defaultQuery.
    expect(html).toContain("query GetDocument($identifier: String!)");
    expect(html).toContain("TodoList");
    // The variables payload is embedded alongside it.
    expect(html).toContain(DOC_ID);
    expect(html).toContain('"identifier"');
  });

  it("supports an embedded Authorization header in the payload", async () => {
    const document = "query { DocumentModel { id } }";
    const payload = {
      document,
      variables: undefined,
      headers: JSON.stringify({ Authorization: "Bearer test-token-123" }),
    };
    const url = `${BASE_URL}/explorer?explorerURLState=${lzString.compressToEncodedURIComponent(
      JSON.stringify(payload),
    )}`;
    const res = await fetch(url);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Bearer test-token-123");
  });

  it("falls back to the default welcome page for a garbage explorerURLState", async () => {
    const res = await fetch(
      `${BASE_URL}/explorer?explorerURLState=not-a-lz-payload`,
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    // A garbage payload must not inject a query: the page is served with
    // `defaultQuery` undefined (plain GraphiQL mount page).
    expect(html).toContain("var defaultQuery = undefined");
  });
});
