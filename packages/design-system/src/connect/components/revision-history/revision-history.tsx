import { Pagination, usePagination } from "#design-system";
import type { Operation } from "@powerhousedao/shared/document-model";
import {
  garbageCollect,
  sortOperations,
} from "@powerhousedao/shared/document-model";
import { useEffect, useMemo, useState } from "react";
import { ConnectTooltipProvider } from "../tooltip/tooltip.js";
import { Header } from "./header/header.js";
import { Timeline } from "./timeline/timeline.js";

type CommonProps = {
  readonly documentTitle: string;
  readonly documentId: string;
  readonly onClose: () => void;
  readonly itemsPerPage?: number;
  readonly documentState?: object;
  readonly onCopyState?: () => void;
  readonly onCopyDocId?: () => void;
};

/** The current, scoped props. */
export type RevisionHistoryScopedProps = CommonProps & {
  /** The operations of the selected scope loaded so far, in any order. */
  readonly operations: readonly Operation[];
  /** A page of operations is being fetched. */
  readonly isLoading: boolean;
  /** More operations exist beyond the loaded ones. */
  readonly hasNextPage: boolean;
  /**
   * Called by the component whenever it can take the next page.
   * Must be referentially stable (for example the hook's `fetchNextPage`);
   * an inline arrow re-fires the effect every render.
   */
  readonly onLoadNextPage: () => void;
  /** The scopes offered in the selector, for example the keys of `document.header.revision`. */
  readonly scopes: readonly string[];
  /** The selected scope. */
  readonly scope: string;
  readonly onScopeChange: (scope: string) => void;
  /**
   * The last page failed. Operations loaded so far are still shown, and the
   * walk stops asking for more; there is no retry from inside the component.
   */
  readonly error?: Error;
};

/**
 * Legacy props: the whole global and local history, toggled inside the
 * component.
 * @deprecated Pass one scope's `operations` with `scopes`/`scope`/`onScopeChange` and the loading props. Removed in the next major.
 */
export type RevisionHistoryLegacyProps = CommonProps & {
  readonly globalOperations: readonly Operation[];
  readonly localOperations: readonly Operation[];
};

export type RevisionHistoryProps =
  | RevisionHistoryScopedProps
  | RevisionHistoryLegacyProps;

/**
 * The revision history panel. Pages arrive oldest first while the timeline
 * renders newest first, so rendering progressively would show operations in
 * the wrong order until the last page landed and would repaint the whole
 * timeline on every page in between. Instead the component keeps asking for
 * the next page, showing "Loading operations…" and a running count, until
 * the walk completes, then renders the pagination and timeline once.
 */
function ScopedRevisionHistory(props: RevisionHistoryScopedProps) {
  const {
    documentTitle,
    documentId,
    operations,
    isLoading,
    hasNextPage,
    onLoadNextPage,
    scopes,
    scope,
    onScopeChange,
    onClose,
    itemsPerPage = 100,
    documentState,
    onCopyState,
    onCopyDocId,
    error,
  } = props;

  useEffect(() => {
    if (!hasNextPage || isLoading || error) return;
    // Deferred: the cache's fetch and the useSyncExternalStore-driven render
    // it triggers are both synchronous, so calling onLoadNextPage here
    // directly would chain fetch -> render -> effect -> fetch into one
    // uninterrupted task; setTimeout(0) yields so the status line paints and
    // the close button stays responsive between pages.
    const handle = window.setTimeout(onLoadNextPage, 0);
    return () => window.clearTimeout(handle);
  }, [hasNextPage, isLoading, onLoadNextPage, error]);

  // The history is incomplete: still fetching pages, or waiting on the very
  // first one. While true, nothing is rendered but the progress status. A
  // failed page ends the walk instead of latching this forever: we render
  // what loaded and a short failure line rather than spinning with no retry.
  const isWalking =
    !error && (hasNextPage || (isLoading && operations.length === 0));

  const visibleOperations = useMemo(
    () =>
      isWalking
        ? []
        : garbageCollect(sortOperations([...operations])).sort(
            (a, b) => b.index - a.index,
          ),
    [operations, isWalking],
  );

  const {
    pageItems,
    pages,
    goToPage,
    goToNextPage,
    goToPreviousPage,
    goToFirstPage,
    goToLastPage,
    hiddenNextPages,
    isNextPageAvailable,
    isPreviousPageAvailable,
  } = usePagination(visibleOperations, {
    itemsPerPage,
  });

  function onChangeScope(nextScope: string) {
    goToFirstPage();
    onScopeChange(nextScope);
  }

  const showPagination = visibleOperations.length > itemsPerPage;

  const PaginationComponent = showPagination ? (
    <div className="mt-4 flex w-full justify-end">
      <Pagination
        firstPageLabel="First Page"
        goToFirstPage={goToFirstPage}
        goToLastPage={goToLastPage}
        goToNextPage={goToNextPage}
        goToPage={goToPage}
        goToPreviousPage={goToPreviousPage}
        hiddenNextPages={hiddenNextPages}
        isNextPageAvailable={isNextPageAvailable}
        isPreviousPageAvailable={isPreviousPageAvailable}
        lastPageLabel="Last Page"
        nextPageLabel="Next"
        pages={pages}
        previousPageLabel="Previous"
      />
    </div>
  ) : (
    <hr className="h-12 border-none" />
  );

  const hasOperations = visibleOperations.length > 0;

  return (
    <ConnectTooltipProvider>
      <div className="p-6">
        <Header
          docId={documentId}
          onChangeScope={onChangeScope}
          onClose={onClose}
          scope={scope}
          scopes={scopes}
          title={documentTitle}
          documentState={documentState}
          onCopyState={onCopyState}
          onCopyDocId={onCopyDocId}
        />
        {isWalking ? (
          <div className="mt-4 flex flex-col items-center rounded-md bg-background p-4">
            <h3 className="my-40 text-foreground">Loading operations…</h3>
            {operations.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {operations.length} loaded so far
              </p>
            )}
          </div>
        ) : (
          <>
            {PaginationComponent}
            <div className="mt-4 flex flex-col items-center rounded-md bg-background p-4">
              {error && (
                <p className="mb-2 text-xs text-destructive">
                  Could not load the rest of the history: {error.message}
                </p>
              )}
              {hasOperations ? (
                <div className="grid grid-cols-[minmax(min-content,1018px)]">
                  <Timeline operations={pageItems} />
                </div>
              ) : error ? null : (
                <h3 className="my-40 text-foreground">
                  This document has no recorded operations yet.
                </h3>
              )}
            </div>
            {PaginationComponent}
          </>
        )}
      </div>
    </ConnectTooltipProvider>
  );
}

const LEGACY_SCOPES = ["global", "local"] as const;
const noop = () => {
  /* the legacy form has already loaded the whole history */
};

/** Toggles between the whole global and local history loaded up front. */
function LegacyRevisionHistory(props: RevisionHistoryLegacyProps) {
  const { globalOperations, localOperations, ...common } = props;
  const [scope, setScope] = useState<string>("global");
  return (
    <ScopedRevisionHistory
      {...common}
      operations={scope === "local" ? localOperations : globalOperations}
      isLoading={false}
      hasNextPage={false}
      onLoadNextPage={noop}
      scopes={LEGACY_SCOPES}
      scope={scope}
      onScopeChange={setScope}
    />
  );
}

/**
 * The revision history panel. Pages arrive oldest first while the timeline
 * renders newest first, so it waits for the whole history to load before
 * rendering the timeline, showing "Loading operations…" and a running count
 * in the meantime.
 *
 * Also accepts the deprecated `globalOperations`/`localOperations` pair
 * (see `RevisionHistoryLegacyProps`), toggling between them internally.
 */
export function RevisionHistory(props: RevisionHistoryProps) {
  return "globalOperations" in props ? (
    <LegacyRevisionHistory {...props} />
  ) : (
    <ScopedRevisionHistory {...props} />
  );
}
