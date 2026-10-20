import {
  hideRevisionHistory,
  setRevisionHistoryPage,
  useReactorClient,
  useRevisionHistoryPage,
} from "@powerhousedao/reactor-browser";
import type { Operation } from "@powerhousedao/shared/document-model";
import { useEffect, useState } from "react";
import type { DocumentViewProps } from "../router/route-components.js";
import { formatModified, linkClass } from "./index-table.js";

const pagerClass = `${linkClass} disabled:text-core-muted disabled:no-underline`;

/** Operations per scope on a history page. */
export const HISTORY_PAGE_SIZE = 50;

/** Page `page`'s index range of a scope with `count` operations, newest first. */
export function historyPageRange(count: number, page: number) {
  const end = Math.max(count - (page - 1) * HISTORY_PAGE_SIZE, 0);
  return { start: Math.max(end - HISTORY_PAGE_SIZE, 0), end };
}

type PageState =
  | { status: "loading" }
  | { status: "ready"; operations: Operation[] }
  | { status: "error"; error: Error };

// Fetches only the page's range: `sinceRevision` and a limit of the page size.
function useScopePage(
  documentId: string,
  scope: string,
  start: number,
  end: number,
) {
  const client = useReactorClient();
  // Each result is kept with its request; a newer request reads as loading.
  const key = `${documentId}:${scope}:${start}:${end}`;
  const [result, setResult] = useState<{ key: string; state: PageState }>();
  const empty = !client || end <= start;
  useEffect(() => {
    if (empty) return;
    const controller = new AbortController();
    const setState = (state: PageState) => setResult({ key, state });
    client
      .getOperations(
        documentId,
        { scopes: [scope] },
        { sinceRevision: start },
        { cursor: "", limit: end - start },
        controller.signal,
      )
      .then(
        (page) => {
          const operations = page.results
            .filter((operation) => operation.index < end)
            .sort((a, b) => b.index - a.index);
          setState({ status: "ready", operations });
        },
        (reason: unknown) => {
          if (controller.signal.aborted) return;
          setState({
            status: "error",
            error: reason instanceof Error ? reason : new Error(String(reason)),
          });
        },
      );
    return () => controller.abort();
  }, [client, empty, key, documentId, scope, start, end]);
  if (empty) return { status: "ready", operations: [] } as const;
  return result?.key === key ? result.state : ({ status: "loading" } as const);
}

function ScopeOperations(props: {
  documentId: string;
  scope: string;
  count: number;
  page: number;
}) {
  const { start, end } = historyPageRange(props.count, props.page);
  const state = useScopePage(props.documentId, props.scope, start, end);
  return (
    <section className="mb-6">
      <h2 className="mb-2 font-semibold">
        {props.scope}{" "}
        <span className="font-normal text-core-muted">
          {end > start
            ? `${end - start} of ${props.count}, ${start}-${end - 1}`
            : `0 of ${props.count}`}
        </span>
      </h2>
      {state.status === "error" ? (
        <p className="text-core-danger">{state.error.message}</p>
      ) : state.status === "loading" ? (
        <p className="text-core-muted">Loading…</p>
      ) : state.operations.length === 0 ? (
        <p className="text-core-muted">No operations on this page.</p>
      ) : (
        <table
          aria-label={`${props.scope} operations`}
          className="w-full border-collapse"
        >
          <thead>
            <tr className="border-b border-core-border text-left text-core-muted">
              <th className="py-1 pr-6 font-normal">Index</th>
              <th className="py-1 pr-6 font-normal">Action</th>
              <th className="py-1 font-normal">Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {state.operations.map((operation) => (
              <tr
                key={operation.index}
                className="border-b border-core-border/50 hover:bg-core-hover"
              >
                <td className="py-1 pr-6">{operation.index}</td>
                <td className="py-1 pr-6">{operation.action.type}</td>
                <td className="py-1">
                  {formatModified(operation.timestampUtcMs)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** Core's revision history: each scope's operations, newest first, a page at a time. */
export function DocumentHistory({ document }: DocumentViewProps) {
  const page = useRevisionHistoryPage();
  const { header } = document;
  const scopes = Object.entries(header.revision);
  const pageCount = Math.max(
    1,
    ...scopes.map(([, count]) => Math.ceil(count / HISTORY_PAGE_SIZE)),
  );
  const pager = (
    <nav aria-label="History pages" className="flex items-center gap-4">
      <button
        type="button"
        className={pagerClass}
        disabled={page <= 1}
        onClick={() => setRevisionHistoryPage(page - 1)}
      >
        Newer
      </button>
      <span className="text-core-muted">
        Page {page} of {pageCount}
      </span>
      <button
        type="button"
        className={pagerClass}
        disabled={page >= pageCount}
        onClick={() => setRevisionHistoryPage(page + 1)}
      >
        Older
      </button>
    </nav>
  );
  return (
    <div className="p-6 font-mono text-sm text-core-fg">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">
          History of {header.name || header.id}
        </h1>
        <button
          type="button"
          className={linkClass}
          onClick={hideRevisionHistory}
        >
          Close
        </button>
      </div>
      <div className="mb-4">{pager}</div>
      {scopes.length === 0 ? (
        <p className="text-core-muted">No operations yet.</p>
      ) : (
        scopes.map(([scope, count]) => (
          <ScopeOperations
            key={scope}
            documentId={header.id}
            scope={scope}
            count={count}
            page={page}
          />
        ))
      )}
    </div>
  );
}
