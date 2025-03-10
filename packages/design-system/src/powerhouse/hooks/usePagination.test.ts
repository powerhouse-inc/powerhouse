import { renderHook } from "@testing-library/react";
import { act } from "react";
import { usePagination } from "./usePagination.js";
import { it } from "vitest";

const items = Array.from({ length: 107 }, (_, i) => `Page ${i + 1}`);

describe("usePagination hook", () => {
  const renderUsePagination = (
    initialPage = 0,
    itemsPerPage = 10,
    pageRange = 5,
  ) => {
    const usePaginationResult = renderHook(() =>
      usePagination(items, {
        initialPage,
        itemsPerPage,
        pageRange,
      }),
    );

    return usePaginationResult;
  };

  describe("navigation", () => {
    it("should pagination information", () => {
      const { result } = renderUsePagination();
      const { pageItems, pageCount } = result.current;

      expect(pageCount).toBe(11);
      expect(pageItems).toHaveLength(10);
      expect(pageItems).toMatchObject([
        "Page 1",
        "Page 2",
        "Page 3",
        "Page 4",
        "Page 5",
        "Page 6",
        "Page 7",
        "Page 8",
        "Page 9",
        "Page 10",
      ]);
    });

    it("isPreviousPageAvailable should be false when currentPage is the first page", () => {
      const { result } = renderUsePagination();
      const { isPreviousPageAvailable, currentPage } = result.current;

      expect(currentPage).toBe(0);
      expect(isPreviousPageAvailable).toBe(false);
    });

    it("isNextPageAvailable should be false when currentPage is the last page", () => {
      const { result } = renderUsePagination(10);
      const { currentPage, isNextPageAvailable } = result.current;

      expect(currentPage).toBe(10);
      expect(isNextPageAvailable).toBe(false);
    });

    it("should navigate to the last page", () => {
      const { result } = renderUsePagination();
      const { goToLastPage } = result.current;

      act(() => {
        goToLastPage();
      });

      expect(result.current.currentPage).toBe(10);
      expect(result.current.pageItems).toMatchObject([
        "Page 101",
        "Page 102",
        "Page 103",
        "Page 104",
        "Page 105",
        "Page 106",
        "Page 107",
      ]);
    });

    it("should navigate to the first page", () => {
      const { result } = renderUsePagination(10);
      const { goToFirstPage } = result.current;

      expect(result.current.currentPage).toBe(10);

      act(() => {
        goToFirstPage();
      });

      expect(result.current.currentPage).toBe(0);
      expect(result.current.pageItems).toMatchObject([
        "Page 1",
        "Page 2",
        "Page 3",
        "Page 4",
        "Page 5",
        "Page 6",
        "Page 7",
        "Page 8",
        "Page 9",
        "Page 10",
      ]);
    });

    it("should navigate to the next page", () => {
      const { result } = renderUsePagination();
      const { goToNextPage } = result.current;

      expect(result.current.currentPage).toBe(0);

      act(() => {
        goToNextPage();
      });

      expect(result.current.currentPage).toBe(1);
      expect(result.current.pageItems).toMatchObject([
        "Page 11",
        "Page 12",
        "Page 13",
        "Page 14",
        "Page 15",
        "Page 16",
        "Page 17",
        "Page 18",
        "Page 19",
        "Page 20",
      ]);
    });

    it("should not navigate to the next page when it is not available", () => {
      const { result } = renderUsePagination(10);
      const { goToNextPage } = result.current;

      expect(result.current.currentPage).toBe(10);

      act(() => {
        goToNextPage();
      });

      expect(result.current.currentPage).toBe(10);
      expect(result.current.pageItems).toMatchObject([
        "Page 101",
        "Page 102",
        "Page 103",
        "Page 104",
        "Page 105",
        "Page 106",
        "Page 107",
      ]);
    });

    it("should navigate to the previous page", () => {
      const { result } = renderUsePagination(10);
      const { goToPreviousPage } = result.current;

      expect(result.current.currentPage).toBe(10);

      act(() => {
        goToPreviousPage();
      });

      expect(result.current.currentPage).toBe(9);
      expect(result.current.pageItems).toMatchObject([
        "Page 91",
        "Page 92",
        "Page 93",
        "Page 94",
        "Page 95",
        "Page 96",
        "Page 97",
        "Page 98",
        "Page 99",
        "Page 100",
      ]);
    });

    it("should not navigate to the previous page when it is not available", () => {
      const { result } = renderUsePagination();
      const { goToPreviousPage } = result.current;

      expect(result.current.currentPage).toBe(0);

      act(() => {
        goToPreviousPage();
      });

      expect(result.current.currentPage).toBe(0);
      expect(result.current.pageItems).toMatchObject([
        "Page 1",
        "Page 2",
        "Page 3",
        "Page 4",
        "Page 5",
        "Page 6",
        "Page 7",
        "Page 8",
        "Page 9",
        "Page 10",
      ]);
    });

    it("should navigate to a specific page", () => {
      const { result } = renderUsePagination();
      const { goToPage } = result.current;

      expect(result.current.currentPage).toBe(0);

      act(() => {
        goToPage(5);
      });

      expect(result.current.currentPage).toBe(5);
      expect(result.current.pageItems).toMatchObject([
        "Page 51",
        "Page 52",
        "Page 53",
        "Page 54",
        "Page 55",
        "Page 56",
        "Page 57",
        "Page 58",
        "Page 59",
        "Page 60",
      ]);
    });

    it("should not navigate to a page that is out of range", () => {
      const { result } = renderUsePagination();
      const { goToPage } = result.current;

      expect(result.current.currentPage).toBe(0);

      act(() => {
        goToPage(20);
      });

      expect(result.current.currentPage).toBe(0);
      expect(result.current.pageItems).toMatchObject([
        "Page 1",
        "Page 2",
        "Page 3",
        "Page 4",
        "Page 5",
        "Page 6",
        "Page 7",
        "Page 8",
        "Page 9",
        "Page 10",
      ]);
    });
  });

  describe("page range", () => {
    const scneario1 = [
      {
        title: "page range = 5",
        pageRange: 5,
        currentPageIndex: 5,
        expected: [
          { index: 3, active: false, number: 4 },
          { index: 4, active: false, number: 5 },
          { index: 5, active: true, number: 6 },
          { index: 6, active: false, number: 7 },
          { index: 7, active: false, number: 8 },
        ],
      },
      {
        title: "page range = 4",
        pageRange: 4,
        currentPageIndex: 5,
        expected: [
          { index: 4, active: false, number: 5 },
          { index: 5, active: true, number: 6 },
          { index: 6, active: false, number: 7 },
          { index: 7, active: false, number: 8 },
        ],
      },
      {
        title: "page range = 10",
        pageRange: 10,
        currentPageIndex: 5,
        expected: [
          { index: 1, active: false, number: 2 },
          { index: 2, active: false, number: 3 },
          { index: 3, active: false, number: 4 },
          { index: 4, active: false, number: 5 },
          { index: 5, active: true, number: 6 },
          { index: 6, active: false, number: 7 },
          { index: 7, active: false, number: 8 },
          { index: 8, active: false, number: 9 },
          { index: 9, active: false, number: 10 },
          { index: 10, active: false, number: 11 },
        ],
      },
    ];

    it.each(scneario1)(
      "should display the correct page range when the current page is in the middle; $title",
      ({ pageRange, currentPageIndex, expected }) => {
        const { result } = renderUsePagination(5, currentPageIndex, pageRange);
        const { pages } = result.current;

        expect(pages).toHaveLength(pageRange);
        expect(pages).toMatchObject(expected);
      },
    );

    const scneario2 = [
      {
        title: "page range = 5",
        pageRange: 5,
        currentPageIndex: 0,
        expected: [
          { index: 0, active: true, number: 1 },
          { index: 1, active: false, number: 2 },
          { index: 2, active: false, number: 3 },
          { index: 3, active: false, number: 4 },
          { index: 4, active: false, number: 5 },
        ],
      },
      {
        title: "page range = 4",
        pageRange: 4,
        currentPageIndex: 0,
        expected: [
          { index: 0, active: true, number: 1 },
          { index: 1, active: false, number: 2 },
          { index: 2, active: false, number: 3 },
          { index: 3, active: false, number: 4 },
        ],
      },
      {
        title: "page range = 10",
        pageRange: 10,
        currentPageIndex: 0,
        expected: [
          { index: 0, active: true, number: 1 },
          { index: 1, active: false, number: 2 },
          { index: 2, active: false, number: 3 },
          { index: 3, active: false, number: 4 },
          { index: 4, active: false, number: 5 },
          { index: 5, active: false, number: 6 },
          { index: 6, active: false, number: 7 },
          { index: 7, active: false, number: 8 },
          { index: 8, active: false, number: 9 },
          { index: 9, active: false, number: 10 },
        ],
      },
    ];

    it.each(scneario2)(
      "should display the correct page range when the current page is at the beginning; $title",
      ({ pageRange, currentPageIndex, expected }) => {
        const { result } = renderUsePagination(currentPageIndex, 10, pageRange);
        const { pages } = result.current;

        expect(pages).toHaveLength(pageRange);
        expect(pages).toMatchObject(expected);
      },
    );

    const scneario3 = [
      {
        title: "page range = 5",
        pageRange: 5,
        currentPageIndex: 10,
        expected: [
          { index: 6, active: false, number: 7 },
          { index: 7, active: false, number: 8 },
          { index: 8, active: false, number: 9 },
          { index: 9, active: false, number: 10 },
          { index: 10, active: true, number: 11 },
        ],
      },
      {
        title: "page range = 4",
        pageRange: 4,
        currentPageIndex: 10,
        expected: [
          { index: 7, active: false, number: 8 },
          { index: 8, active: false, number: 9 },
          { index: 9, active: false, number: 10 },
          { index: 10, active: true, number: 11 },
        ],
      },
      {
        title: "page range = 10",
        pageRange: 10,
        currentPageIndex: 10,
        expected: [
          { index: 1, active: false, number: 2 },
          { index: 2, active: false, number: 3 },
          { index: 3, active: false, number: 4 },
          { index: 4, active: false, number: 5 },
          { index: 5, active: false, number: 6 },
          { index: 6, active: false, number: 7 },
          { index: 7, active: false, number: 8 },
          { index: 8, active: false, number: 9 },
          { index: 9, active: false, number: 10 },
          { index: 10, active: true, number: 11 },
        ],
      },
    ];

    it.each(scneario3)(
      "should display the correct page range when the current page is at the end; $title",
      ({ currentPageIndex, expected, pageRange }) => {
        const { result } = renderUsePagination(currentPageIndex, 10, pageRange);
        const { pages } = result.current;

        expect(pages).toHaveLength(pageRange);
        expect(pages).toMatchObject(expected);
      },
    );

    const scneario4 = [
      {
        title: "page range = 5",
        pageRange: 5,
        currentPageIndex: 9,
        expected: [
          { index: 6, active: false, number: 7 },
          { index: 7, active: false, number: 8 },
          { index: 8, active: false, number: 9 },
          { index: 9, active: true, number: 10 },
          { index: 10, active: false, number: 11 },
        ],
      },
      {
        title: "page range = 4",
        pageRange: 4,
        currentPageIndex: 9,
        expected: [
          { index: 7, active: false, number: 8 },
          { index: 8, active: false, number: 9 },
          { index: 9, active: true, number: 10 },
          { index: 10, active: false, number: 11 },
        ],
      },
      {
        title: "page range = 10",
        pageRange: 10,
        currentPageIndex: 9,
        expected: [
          { index: 1, active: false, number: 2 },
          { index: 2, active: false, number: 3 },
          { index: 3, active: false, number: 4 },
          { index: 4, active: false, number: 5 },
          { index: 5, active: false, number: 6 },
          { index: 6, active: false, number: 7 },
          { index: 7, active: false, number: 8 },
          { index: 8, active: false, number: 9 },
          { index: 9, active: true, number: 10 },
          { index: 10, active: false, number: 11 },
        ],
      },
    ];

    it.each(scneario4)(
      "should display the correct page range when the current page is close to the end; $title",
      ({ currentPageIndex, expected, pageRange }) => {
        const { result } = renderUsePagination(currentPageIndex, 10, pageRange);
        const { pages } = result.current;

        expect(pages).toHaveLength(pageRange);
        expect(pages).toMatchObject(expected);
      },
    );

    const scneario5 = [
      {
        title: "page range = 5",
        pageRange: 5,
        currentPageIndex: 1,
        expected: [
          { index: 0, active: false, number: 1 },
          { index: 1, active: true, number: 2 },
          { index: 2, active: false, number: 3 },
          { index: 3, active: false, number: 4 },
          { index: 4, active: false, number: 5 },
        ],
      },
      {
        title: "page range = 4",
        pageRange: 4,
        currentPageIndex: 1,
        expected: [
          { index: 0, active: false, number: 1 },
          { index: 1, active: true, number: 2 },
          { index: 2, active: false, number: 3 },
          { index: 3, active: false, number: 4 },
        ],
      },
      {
        title: "page range = 10",
        pageRange: 10,
        currentPageIndex: 1,
        expected: [
          { index: 0, active: false, number: 1 },
          { index: 1, active: true, number: 2 },
          { index: 2, active: false, number: 3 },
          { index: 3, active: false, number: 4 },
          { index: 4, active: false, number: 5 },
          { index: 5, active: false, number: 6 },
          { index: 6, active: false, number: 7 },
          { index: 7, active: false, number: 8 },
          { index: 8, active: false, number: 9 },
          { index: 9, active: false, number: 10 },
        ],
      },
    ];

    it.each(scneario5)(
      "should display the correct page range when the current page is close to the beginning; $title",
      ({ currentPageIndex, expected, pageRange }) => {
        const { result } = renderUsePagination(currentPageIndex, 10, pageRange);
        const { pages } = result.current;

        expect(pages).toHaveLength(pageRange);
        expect(pages).toMatchObject(expected);
      },
    );

    it("should not return more pages that the total number of pages available", () => {
      const { result } = renderUsePagination(0, 10, 20);
      const { pages } = result.current;

      expect(pages).toHaveLength(11);
    });
  });
});
