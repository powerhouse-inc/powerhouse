import { useCallback, useMemo, useState } from 'react';

export type PageItem = {
    index: number;
    number: number;
    active: boolean;
};

export interface UsePaginationOptions {
    pageRange?: number;
    initialPage?: number;
    itemsPerPage?: number;
}

/**
 * Custom hook for pagination.
 *
 * @template T - The type of items in the pagination.
 * @param {T[]} items - The array of items to paginate.
 * @param {UsePaginationOptions} [options] - The pagination options.
 * @returns {{
 *   pages: PageItem[]; - The array of page items.
 *   goToPage: (page: number) => void; - The function to go to a specific page.
 *   pageItems: T[]; - The array of items for the current page.
 *   pageCount: number; - The total number of pages.
 *   currentPage: number; - The current page index.
 *   goToLastPage: () => void; - The function to go to the last page.
 *   goToFirstPage: () => void; - The function to go to the first page.
 *   goToNextPage: () => void; - The function to go to the next page.
 *   goToPreviousPage: () => void; - The function to go to the previous page.
 *   isNextPageAvailable: boolean; - The flag to indicate if the next page is available.
 *   isPreviousPageAvailable: boolean; - The flag to indicate if the previous page is available.
 * }} - The pagination object with various functions and properties.
 */
export function usePagination<T>(items: T[], options?: UsePaginationOptions) {
    const { itemsPerPage = 10, initialPage = 0, pageRange = 5 } = options || {};

    const [currentPage, setCurrentPage] = useState(initialPage);

    const pageCount = Math.ceil(items.length / itemsPerPage);
    const isNextPageAvailable = currentPage < pageCount - 1;
    const isPreviousPageAvailable = currentPage > 0;

    const goToNextPage = useCallback(() => {
        if (isNextPageAvailable) {
            setCurrentPage(prev => prev + 1);
        }
    }, [isNextPageAvailable, setCurrentPage]);

    const goToPreviousPage = useCallback(() => {
        if (isPreviousPageAvailable) {
            setCurrentPage(prev => prev - 1);
        }
    }, [isPreviousPageAvailable, setCurrentPage]);

    const goToLastPage = useCallback(() => {
        setCurrentPage(pageCount - 1);
    }, [pageCount]);

    const goToFirstPage = useCallback(() => {
        setCurrentPage(0);
    }, []);

    const goToPage = useCallback(
        (page: number) => {
            if (page >= 0 && page < pageCount) {
                setCurrentPage(page);
            }
        },
        [pageCount],
    );

    const pageOffset = Math.floor((pageRange - 1) / 2);
    const availableRange = Math.min(pageRange, pageCount);
    const maxStartIndex = Math.max(pageCount - availableRange);
    const startIndex = Math.min(
        maxStartIndex,
        Math.max(currentPage - pageOffset, 0),
    );

    const pages = useMemo(() => {
        const range: PageItem[] = [];
        for (let i = startIndex; i < availableRange + startIndex; i++) {
            range.push({
                index: i,
                active: i === currentPage,
                number: i + 1,
            });
        }
        return range;
    }, [availableRange, startIndex, currentPage]);

    const pageItems = items.slice(
        currentPage * itemsPerPage,
        (currentPage + 1) * itemsPerPage,
    );

    return {
        pages,
        goToPage,
        pageItems,
        pageCount,
        currentPage,
        goToLastPage,
        goToFirstPage,
        goToNextPage,
        goToPreviousPage,
        isNextPageAvailable,
        isPreviousPageAvailable,
    };
}
