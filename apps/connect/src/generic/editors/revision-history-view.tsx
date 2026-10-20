import type { DocumentViewProps } from "@powerhousedao/connect-core/router";
import { toast } from "@powerhousedao/connect/services";
import { RevisionHistory } from "@powerhousedao/design-system/connect";
import {
  hideRevisionHistory,
  setRevisionHistoryPage,
  useDocumentOperations,
  useRevisionHistoryPage,
} from "@powerhousedao/reactor-browser";
import { useMemo, useState } from "react";

// Prefers "global" when the document carries it, otherwise the first scope.
function defaultScope(scopes: readonly string[]) {
  return scopes.includes("global") ? "global" : scopes[0];
}

/** The generic chrome's `history` slot: the design system's RevisionHistory,
 * paged through `?history&historyPage=N`. */
export function GenericRevisionHistory({ document }: DocumentViewProps) {
  const { id, name, revision } = document.header;
  // The scopes a document carries operations for; every document has at least "global".
  const scopes = useMemo(() => {
    const keys = Object.keys(revision);
    return keys.length > 0 ? keys : ["global"];
  }, [revision]);
  const [operationScope, setOperationScope] = useState(() =>
    defaultScope(scopes),
  );
  const scope = scopes.includes(operationScope)
    ? operationScope
    : defaultScope(scopes);
  const page = useRevisionHistoryPage();

  // The whole scope: undo/redo skips are collapsed over the full history
  // before the newest-first pages are cut. The panel walks the pages itself.
  const { operations, isLoading, hasNextPage, fetchNextPage, error } =
    useDocumentOperations(id, scope, {
      // A page fetch costs the same for 100 or 500 rows in the in-browser
      // reactor, so fewer, bigger round trips are strictly cheaper.
      limit: 500,
    });

  return (
    <RevisionHistory
      key={id}
      documentTitle={name}
      documentId={id}
      operations={operations}
      isLoading={isLoading}
      hasNextPage={hasNextPage}
      onLoadNextPage={fetchNextPage}
      error={error}
      scopes={scopes}
      scope={scope}
      onScopeChange={setOperationScope}
      page={page}
      onPageChange={setRevisionHistoryPage}
      onClose={hideRevisionHistory}
      documentState={document.state}
      onCopyState={() => {
        toast("Copied document state to clipboard", { type: "success" });
      }}
      onCopyDocId={() => {
        toast("Copied document ID to clipboard", { type: "success" });
      }}
    />
  );
}
