import {
  Icon,
  type PageItem,
  type UsePaginationBaseResult,
} from "@/powerhouse";
import { PaginationButton } from "./pagination-button";

export type PaginationEvent = {
  event: "first" | "previous" | "next" | "last";
};

export type PaginationPageEvent = {
  event: "page";
  page: PageItem;
};

export interface PaginationProps
  extends Omit<UsePaginationBaseResult, "pageCount" | "currentPage"> {
  displayPagesLeftIndicator?: boolean;
  firstPageLabel?: React.ReactNode;
  lastPageLabel?: React.ReactNode;
  nextPageLabel?: React.ReactNode;
  previousPageLabel?: React.ReactNode;
}

export const Pagination: React.FC<PaginationProps> = (props) => {
  const {
    pages = [],
    goToFirstPage,
    goToLastPage,
    goToNextPage,
    goToPreviousPage,
    goToPage,
    isNextPageAvailable,
    isPreviousPageAvailable,
    hiddenNextPages,
    firstPageLabel = "First",
    lastPageLabel = "Last",
    nextPageLabel = "Next",
    previousPageLabel = "Previous",
  } = props;

  return (
    <div className="flex gap-x-1">
      {firstPageLabel ? (
        <PaginationButton
          disabled={!isPreviousPageAvailable}
          onClick={() => goToFirstPage()}
        >
          {firstPageLabel}
        </PaginationButton>
      ) : null}
      {previousPageLabel ? (
        <PaginationButton
          disabled={!isPreviousPageAvailable}
          onClick={() => goToPreviousPage()}
        >
          <Icon className="rotate-90" name="ChevronDown" size={16} />
          {previousPageLabel}
        </PaginationButton>
      ) : null}
      {pages.map((page) => (
        <PaginationButton
          active={page.active}
          key={page.index}
          onClick={() => goToPage(page.index)}
        >
          {page.number}
        </PaginationButton>
      ))}
      {hiddenNextPages ? (
        <span className="flex items-center justify-center px-2">...</span>
      ) : null}
      {nextPageLabel ? (
        <PaginationButton
          disabled={!isNextPageAvailable}
          onClick={() => goToNextPage()}
        >
          {nextPageLabel}
          <Icon className="-rotate-90" name="ChevronDown" size={16} />
        </PaginationButton>
      ) : null}
      {lastPageLabel ? (
        <PaginationButton
          disabled={!isNextPageAvailable}
          onClick={() => goToLastPage()}
        >
          {lastPageLabel}
        </PaginationButton>
      ) : null}
    </div>
  );
};
