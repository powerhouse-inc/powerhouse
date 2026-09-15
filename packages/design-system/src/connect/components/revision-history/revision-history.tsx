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
 * The revision history panel. It renders the newest operation first while
 * the operations API pages oldest first, so it keeps asking for the next
 * page until none is left and renders what has arrived in the meantime.
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
  } = props;

  useEffect(() => {
    if (hasNextPage && !isLoading) {
      onLoadNextPage();
    }
  }, [hasNextPage, isLoading, onLoadNextPage]);

  const visibleOperations = useMemo(
    () =>
      garbageCollect(sortOperations([...operations])).sort(
        (a, b) => b.index - a.index,
      ),
    [operations],
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

  const showPagination =
    visibleOperations.length > itemsPerPage && !(isLoading && hasNextPage);

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

  const EmptyState = isLoading ? (
    <h3 className="my-40 text-foreground">Loading operations…</h3>
  ) : (
    <h3 className="my-40 text-foreground">
      This document has no recorded operations yet.
    </h3>
  );

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
        {PaginationComponent}
        <div className="mt-4 flex flex-col items-center rounded-md bg-background p-4">
          {hasOperations ? (
            <div className="grid grid-cols-[minmax(min-content,1018px)]">
              <Timeline operations={pageItems} />
            </div>
          ) : (
            EmptyState
          )}
          {hasOperations && isLoading && (
            <p className="mt-4 text-xs text-muted-foreground">
              Loading more operations…
            </p>
          )}
        </div>
        {PaginationComponent}
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
 * The revision history panel. It renders the newest operation first while
 * the operations API pages oldest first, so it keeps asking for the next
 * page until none is left and renders what has arrived in the meantime.
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
