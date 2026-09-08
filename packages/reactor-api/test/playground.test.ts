import vm from "node:vm";
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
  it("renders a string defaultQuery plus a variables prop and fetcher headers", () => {
    const variables = '{"identifier":"doc-1"}';
    const html = renderGraphqlPlayground(
      "/graphql",
      sampleQuery,
      { Authorization: "Bearer t" },
      variables,
    );

    // The rendered script embeds the values as single-quoted literals (the
    // query/variables content is transport-escaped, not template-quoted).
    // Variables reach GraphiQL through its dedicated `variables` prop, never
    // an object-form `defaultQuery` (which GraphiQL 3.x does not accept and
    // renders as an empty query pane).
    expect(html).toContain(`var defaultQuery = '${sampleQuery}';`);
    expect(html).toContain(`var defaultVariables = '${variables}';`);
    expect(html).not.toContain("var defaultQuery = {");
    expect(html).toContain("variables: defaultVariables");
    expect(html).toContain(
      `headers: ${JSON.stringify({ Authorization: "Bearer t" })}`,
    );
  });

  it("keeps the string-form defaultQuery when no variables are given", () => {
    const html = renderGraphqlPlayground("/graphql", sampleQuery);

    expect(html).toContain(`var defaultQuery = '${sampleQuery}';`);
    expect(html).not.toContain("var defaultQuery = {");
    expect(html).toContain("headers: {}");
  });

  it("renders no defaultQuery when no query is given", () => {
    const html = renderGraphqlPlayground("/graphql");

    expect(html).toContain("var defaultQuery = undefined;");
  });
});

/**
 * Executes the page's inline <script> blocks the way a browser would: each
 * block terminates at the FIRST `</script>` it contains, and blocks run in
 * order. The host page's globals (GraphiQL, React, ReactDOM, localStorage,
 * document) are stubbed on a fresh vm sandbox, so the script's top-level
 * `var`s land on the sandbox's global and can be read back. A payload that
 * breaks out of a string literal lands in its own script block and runs for
 * real — assigning `globalThis.__pwned` is the tripwire.
 */
function executeInlineScripts(html: string) {
  const sandbox: Record<string, unknown> = {
    GraphiQL: { createFetcher: (cfg: unknown) => cfg },
    GraphiQLPluginExplorer: { explorerPlugin: () => ({}) },
    React: { createElement: (...a: unknown[]) => a },
    ReactDOM: { createRoot: () => ({ render: () => {} }) },
    localStorage: { getItem: () => null, setItem: () => {} },
    document: { getElementById: () => ({}) },
  };
  vm.createContext(sandbox);
  const blocks = [
    ...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi),
  ];
  for (const [, body] of blocks) {
    try {
      new vm.Script(body).runInContext(sandbox);
    } catch {
      // A browser reports a parse error for one <script> element and keeps
      // running the next; mirror that so a breakout that also mangles its
      // host block still reaches the injected block.
    }
  }
  return sandbox;
}

describe("renderGraphqlPlayground script-injection safety", () => {
  it("a query containing </script> cannot break into a new executable script block", () => {
    const evil =
      "query { a } </script><script>globalThis.__pwned = true</script>";
    const html = renderGraphqlPlayground("/graphql", evil);

    // The four CDN script tags plus the one inline block — the payload must
    // not contribute any script element of its own.
    expect((html.match(/<script/gi) ?? []).length).toBe(5);
    const sandbox = executeInlineScripts(html);
    expect(sandbox.__pwned).toBeUndefined();
  });

  it("keeps hostile content inert in the variables and headers channels", () => {
    const variables =
      '{"x":"</script><script>globalThis.__pwned = true</script>"}';
    const headers = {
      Authorization:
        "Bearer </script><script>globalThis.__pwned = true</script>",
    };
    const html = renderGraphqlPlayground(
      "/graphql",
      "query { a }",
      headers,
      variables,
    );

    const sandbox = executeInlineScripts(html);
    expect(sandbox.__pwned).toBeUndefined();
  });

  it("round-trips hostile bytes exactly and runs no injected code", () => {
    // Backticks, template expressions, quotes, backslashes, newlines and a
    // script terminator: everything a payload can carry through the
    // lz-string/JSON pipeline.
    const query =
      "query { a } ` \n ' \\\\ ${globalThis.__pwned = true} </script>";
    const variables = '{"v":"</script>`${1}"}';
    const html = renderGraphqlPlayground(
      "/graphql",
      query,
      { Authorization: "Bearer t" },
      variables,
    );

    const sandbox = executeInlineScripts(html);
    expect(sandbox.__pwned).toBeUndefined();
    expect(sandbox.defaultQuery).toBe(query);
    expect(sandbox.defaultVariables).toBe(variables);
    expect(sandbox.fetcher).toEqual({
      url: "/graphql",
      headers: { Authorization: "Bearer t" },
    });
  });
});
