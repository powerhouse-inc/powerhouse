import { compressToEncodedURIComponent } from "lz-string";
import { describe, expect, it } from "vitest";
import {
  decodeExplorerUrlState,
  renderGraphqlPlayground,
} from "../src/graphql/playground.js";

/**
 * The producer (reactor-browser `buildDocumentSubgraphQuery`) packs
 * `{ document, variables, headers? }` — with `variables` and `headers`
 * already JSON-stringified — into an lz-compressed `explorerURLState`
 * parameter. The decoder must invert exactly that shape, or GraphiQL's
 * prefilled query and auth header are silently dropped.
 */
const sampleQuery =
  "query GetDoc($identifier: String!) { document(identifier: $identifier) { document { state } } }";

function encodeExplorerState(state: Record<string, unknown>) {
  return compressToEncodedURIComponent(JSON.stringify(state));
}

describe("decodeExplorerUrlState", () => {
  it("round-trips document, variables and headers", () => {
    const encoded = encodeExplorerState({
      document: sampleQuery,
      variables: JSON.stringify({ identifier: "doc-1" }, null, 2),
      headers: JSON.stringify({ Authorization: "Bearer t" }),
    });

    expect(decodeExplorerUrlState(encoded)).toEqual({
      query: sampleQuery,
      variables: JSON.stringify({ identifier: "doc-1" }, null, 2),
      headers: { Authorization: "Bearer t" },
    });
  });

  it("omits headers when the payload has none", () => {
    const encoded = encodeExplorerState({
      document: sampleQuery,
      variables: JSON.stringify({ identifier: "doc-1" }),
    });

    expect(decodeExplorerUrlState(encoded)).toEqual({
      query: sampleQuery,
      variables: JSON.stringify({ identifier: "doc-1" }),
      headers: undefined,
    });
  });

  it("returns null for malformed input", () => {
    expect(decodeExplorerUrlState("")).toBeNull();
    expect(decodeExplorerUrlState("not-an-lz-string")).toBeNull();
    expect(
      decodeExplorerUrlState(compressToEncodedURIComponent("not json")),
    ).toBeNull();
    expect(
      decodeExplorerUrlState(
        compressToEncodedURIComponent(JSON.stringify({ variables: "{}" })),
      ),
    ).toBeNull();
  });
});

describe("renderGraphqlPlayground", () => {
  it("renders object-form defaultQuery with query, variables and fetcher headers", () => {
    const variables = '{"identifier":"doc-1"}';
    const html = renderGraphqlPlayground(
      "/graphql",
      sampleQuery,
      { Authorization: "Bearer t" },
      variables,
    );

    expect(html).toContain(
      `var defaultQuery = { query: \`${sampleQuery}\`, variables: \`${variables}\` };`,
    );
    expect(html).toContain(
      `headers: ${JSON.stringify({ Authorization: "Bearer t" })}`,
    );
  });

  it("keeps the string-form defaultQuery when no variables are given", () => {
    const html = renderGraphqlPlayground("/graphql", sampleQuery);

    expect(html).toContain(`var defaultQuery = \`${sampleQuery}\`;`);
    expect(html).not.toContain("var defaultQuery = {");
    expect(html).toContain("headers: {}");
  });

  it("renders no defaultQuery when no query is given", () => {
    const html = renderGraphqlPlayground("/graphql");

    expect(html).toContain("var defaultQuery = undefined;");
  });
});
