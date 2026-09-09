import lzString from "lz-string";

/**
 * The lz-compressed `explorerURLState` parameter carried by switchboard
 * explorer URLs: the JSON payload produced by
 * `buildDocumentSubgraphQuery` in `@powerhousedao/reactor-browser`,
 * `{ document, variables, headers? }` with `variables` and `headers`
 * already JSON-stringified.
 */
export interface ExplorerUrlState {
  /** The GraphQL query to prefill in GraphiQL. */
  query: string;
  /** JSON-stringified variables, as stored in the payload. */
  variables?: string;
  /** Request headers for the GraphiQL fetcher (e.g. Authorization). */
  headers?: Record<string, string>;
}

/**
 * Decodes an `explorerURLState` URL parameter. Returns `null` for anything
 * that is not a valid lz-compressed payload with a non-empty `document`.
 */
export function decodeExplorerUrlState(
  encoded: string,
): ExplorerUrlState | null {
  try {
    const decompressed = lzString.decompressFromEncodedURIComponent(encoded);
    if (!decompressed) {
      return null;
    }
    const payload = JSON.parse(decompressed) as Record<string, unknown>;
    if (typeof payload.document !== "string" || payload.document.length === 0) {
      return null;
    }
    const variables =
      typeof payload.variables === "string" ? payload.variables : undefined;
    let headers: Record<string, string> | undefined;
    if (typeof payload.headers === "string") {
      const parsed: unknown = JSON.parse(payload.headers);
      if (parsed && typeof parsed === "object") {
        headers = parsed as Record<string, string>;
      }
    }
    return { query: payload.document, variables, headers };
  } catch {
    return null;
  }
}

/**
 * Pinned CDN versions for GraphiQL playground dependencies.
 * Using pinned versions avoids unpkg.com redirect issues that can
 * trigger CORS errors in the browser.
 */
const CDN_VERSIONS = {
  react: "18.3.1",
  reactDom: "18.3.1",
  graphiql: "3.8.3",
  pluginExplorer: "4.0.0",
};

/**
 * Escape a string for embedding as a single-quoted JS string literal inside
 * an HTML `<script>` block. The payload reaches the browser through an
 * attacker-controllable URL parameter, so the embedding must survive two
 * parsers: HTML (a `</script>` inside the string would end the script
 * element and start a new, attacker-authored one) and JS (backticks,
 * `${...}` and quotes in the content would otherwise break out of the
 * literal). Backslash, quote, CR and LF escapes keep the literal valid;
 * every `<` becomes `\u003c`, which no HTML parser reads as a tag opener.
 * The escapes resolve when the script parses, so the in-memory value is
 * byte-identical to the input.
 */
function jsStringEscape(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/</g, "\\u003c");
}

/**
 * JSON is already a valid JS object/string literal; the only HTML-hostile
 * byte left is `<` (e.g. `</script>` inside a string value).
 */
function jsJsonEscape(json: string): string {
  return json.replace(/</g, "\\u003c");
}

export function renderGraphqlPlayground(
  url: string,
  query?: string,
  headers: Record<string, string> = {},
  variables?: string,
): string {
  return `<!doctype html>
    <html lang="en">
      <head>
        <title>GraphiQL</title>
        <style>
          body {
            height: 100%;
            margin: 0;
            width: 100%;
            overflow: hidden;
          }

          #graphiql {
            height: 100vh;
          }
        </style>
        <script
          src="https://unpkg.com/react@${CDN_VERSIONS.react}/umd/react.production.min.js"
        ></script>
        <script
          src="https://unpkg.com/react-dom@${CDN_VERSIONS.reactDom}/umd/react-dom.production.min.js"
        ></script>
        <script
          src="https://unpkg.com/graphiql@${CDN_VERSIONS.graphiql}/graphiql.min.js"
        ></script>
        <link rel="stylesheet" href="https://unpkg.com/graphiql@${CDN_VERSIONS.graphiql}/graphiql.min.css" />
        <script
          src="https://unpkg.com/@graphiql/plugin-explorer@${CDN_VERSIONS.pluginExplorer}/dist/index.umd.js"
        ></script>
        <link
          rel="stylesheet"
          href="https://unpkg.com/@graphiql/plugin-explorer@${CDN_VERSIONS.pluginExplorer}/dist/style.css"
        />
      </head>

      <body>
        <div id="graphiql">Loading...</div>
        <script>
            var fetcher = GraphiQL.createFetcher({
                url: '${jsStringEscape(url)}',
                headers: ${jsJsonEscape(JSON.stringify(headers))}
            });
            var defaultQuery = ${
              query ? `'${jsStringEscape(query)}'` : "undefined"
            };
            var defaultVariables = ${
              variables ? `'${jsStringEscape(variables)}'` : "undefined"
            };

            // GraphiQL only applies defaultQuery/variables when the editor has
            // no persisted value. Overwrite any stale persisted state so a
            // returning user still gets the document-scoped query/variables
            // instead of their last session's.
            if (defaultQuery && localStorage.getItem("graphiql:query")) {
                localStorage.setItem("graphiql:query", defaultQuery);
            }
            if (defaultVariables && localStorage.getItem("graphiql:variables")) {
                localStorage.setItem("graphiql:variables", defaultVariables);
            }

            var explorerPlugin = GraphiQLPluginExplorer.explorerPlugin();

            function GraphiQLWithExplorer() {
                return React.createElement(GraphiQL, {
                fetcher: fetcher,
                defaultEditorToolsVisibility: true,
                plugins: [explorerPlugin],
                defaultQuery: defaultQuery,
                variables: defaultVariables
                });
            }

            const root = ReactDOM.createRoot(document.getElementById('graphiql'));
            root.render(React.createElement(GraphiQLWithExplorer));
        </script>
      </body>
    </html>`;
}
