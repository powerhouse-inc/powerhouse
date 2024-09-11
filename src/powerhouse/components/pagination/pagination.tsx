import { Icon, PageItem, UsePaginationBaseResult } from '@/powerhouse';
import { PaginationButton } from './pagination-button';

export type PaginationEvent = {
    event: 'first' | 'previous' | 'next' | 'last';
};

export type PaginationPageEvent = {
    event: 'page';
    page: PageItem;
};

export interface PaginationProps
    extends Omit<UsePaginationBaseResult, 'pageCount' | 'currentPage'> {
    displayPagesLeftIndicator?: boolean;
    firstPageLabel?: React.ReactNode;
    lastPageLabel?: React.ReactNode;
    nextPageLabel?: React.ReactNode;
    previousPageLabel?: React.ReactNode;
}

export const Pagination: React.FC<PaginationProps> = props => {
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
        firstPageLabel,
        lastPageLabel,
        nextPageLabel,
        previousPageLabel,
    } = props;

    return (
        <div className="flex gap-x-1">
            {firstPageLabel && (
                <PaginationButton
                    onClick={() => goToFirstPage()}
                    disabled={!isPreviousPageAvailable}
                >
                    {firstPageLabel}
                </PaginationButton>
            )}
            {previousPageLabel && (
                <PaginationButton
                    onClick={() => goToPreviousPage()}
                    disabled={!isPreviousPageAvailable}
                >
                    <Icon name="ChevronDown" size={16} className="rotate-90" />
                    {previousPageLabel}
                </PaginationButton>
            )}
            {pages.map(page => (
                <PaginationButton
                    key={page.index}
                    active={page.active}
                    onClick={() => goToPage(page.index)}
                >
                    {page.number}
                </PaginationButton>
            ))}
            {hiddenNextPages && (
                <span className="flex items-center justify-center px-2">
                    ...
                </span>
            )}
            {nextPageLabel && (
                <PaginationButton
                    onClick={() => goToNextPage()}
                    disabled={!isNextPageAvailable}
                >
                    {nextPageLabel}
                    <Icon name="ChevronDown" size={16} className="-rotate-90" />
                </PaginationButton>
            )}
            {lastPageLabel && (
                <PaginationButton
                    onClick={() => goToLastPage()}
                    disabled={!isNextPageAvailable}
                >
                    {lastPageLabel}
                </PaginationButton>
            )}
        </div>
    );
};
