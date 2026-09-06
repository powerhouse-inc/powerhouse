import * as lzString from "lz-string";

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
                url: '${url}',
                headers: ${JSON.stringify(headers)}
            });
            var defaultQuery = ${
              query
                ? variables
                  ? `{ query: \`${query}\`, variables: \`${variables}\` }`
                  : `\`${query}\``
                : "undefined"
            };

            if (defaultQuery) {
                var sessionQuery = localStorage.getItem("graphiql:query");
                if (sessionQuery) {
                    localStorage.setItem("graphiql:query", defaultQuery);
                }
            }

            var explorerPlugin = GraphiQLPluginExplorer.explorerPlugin();

            function GraphiQLWithExplorer() {
                return React.createElement(GraphiQL, {
                fetcher: fetcher,
                defaultEditorToolsVisibility: true,
                plugins: [explorerPlugin],
                defaultQuery
                });
            }

            const root = ReactDOM.createRoot(document.getElementById('graphiql'));
            root.render(React.createElement(GraphiQLWithExplorer));
        </script>
      </body>
    </html>`;
}
