import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "vitest-browser-react";
import {
  type AnalyticsDimension,
  AnalyticsGranularity,
  AnalyticsPath,
  AnalyticsProvider,
  type AnalyticsQuery,
  AnalyticsQueryEngine,
  DateTime,
  type IAnalyticsStore,
  useAddSeriesValue,
  useAnalyticsQuery,
  useAnalyticsSeries,
  useGetDimensions,
} from "../src/analytics/analytics.js";
import { MemoryAnalyticsStore } from "../src/analytics/store/memory.js";
import { clearGlobal } from "../src/global/core.js";

describe("Analytics Store", () => {
  const TEST_SOURCE = AnalyticsPath.fromString(
    "test/analytics/AnalyticsStore.spec",
  );

  function createWrapper(store?: IAnalyticsStore) {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    return function Wrapper({ children }: { children: React.ReactNode }) {
      return store ? (
        <AnalyticsProvider store={store} queryClient={queryClient}>
          {children}
        </AnalyticsProvider>
      ) : (
        <QueryClientProvider client={queryClient}>
          {children}
          children
        </QueryClientProvider>
      );
    };
  }

  it("should add and query analytics data", async () => {
    const store = new MemoryAnalyticsStore();
    await store.init();

    const wrapper = createWrapper(store);

    const { result: addResult } = renderHook(() => useAddSeriesValue(), {
      wrapper,
    });

    await addResult.current.mutateAsync({
      start: DateTime.now(),
      source: TEST_SOURCE,
      value: 10000,
      unit: "DAI",
      metric: "Budget",
      dimensions: {
        budget: AnalyticsPath.fromString("atlas/legacy/core-units/SES-001"),
        category: AnalyticsPath.fromString(
          "atlas/headcount/CompensationAndBenefits/FrontEndEngineering",
        ),
        project: TEST_SOURCE,
      },
    });

    // Test querying series data
    const { result: queryResult } = renderHook(
      () =>
        useAnalyticsSeries({
          start: null,
          end: null,
          currency: AnalyticsPath.fromString("DAI"),
          metrics: ["Budget"],
          select: {
            budget: [
              AnalyticsPath.fromString("atlas/legacy/core-units/SES-001"),
            ],
            category: [
              AnalyticsPath.fromString(
                "atlas/headcount/CompensationAndBenefits/FrontEndEngineering",
              ),
            ],
            project: [TEST_SOURCE],
          },
        }),
      { wrapper },
    );

    await vi.waitFor(() => expect(queryResult.current.isSuccess).toBe(true));

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const results = queryResult.current.data!;

    expect(results.length).toBe(1);
    expect(results.map((r) => r.unit)).toEqual(["DAI"]);
    expect(results.map((r) => r.value)).toEqual([10000]);
    expect(
      results.map((r) =>
        (r.dimensions.budget as AnalyticsDimension).path.toString(),
      ),
    ).toEqual(["atlas/legacy/core-units/SES-001"]);
  });

  it("should fail gracefully when analytics store is not available", async () => {
    const wrapper = createWrapper();

    const { result: addResult } = renderHook(() => useAddSeriesValue(), {
      wrapper,
    });

    await expect(
      addResult.current.mutateAsync({
        start: DateTime.now(),
        source: TEST_SOURCE,
        value: 10000,
        unit: "DAI",
        metric: "Budget",
        dimensions: {
          budget: AnalyticsPath.fromString("atlas/legacy/core-units/SES-001"),
        },
      }),
    ).rejects.toThrow(
      "No analytics store available. Use within an AnalyticsProvider.",
    );

    const { result: queryResult } = renderHook(
      () =>
        useAnalyticsSeries({
          start: null,
          end: null,
          currency: AnalyticsPath.fromString("DAI"),
          metrics: ["Budget"],
          select: {
            budget: [
              AnalyticsPath.fromString("atlas/legacy/core-units/SES-001"),
            ],
          },
        }),
      { wrapper },
    );

    await vi.waitFor(() => expect(queryResult.current.isError).toBe(true));
    expect(queryResult.current.error).toMatchObject({
      message: "No analytics store available. Use within an AnalyticsProvider.",
    });
  });
});

describe("Analytics Engine", () => {
  const TEST_SOURCE = AnalyticsPath.fromString("test/analytics/AnalyticsStore");

  function createWrapper(store: MemoryAnalyticsStore) {
    return function Wrapper({ children }: { children: React.ReactNode }) {
      return <AnalyticsProvider store={store}>{children}</AnalyticsProvider>;
    };
  }
  beforeAll(() => {
    clearGlobal("analytics");
  });

  afterEach(() => {
    // Clear the global analytics store before each test
    clearGlobal("analytics");
  });

  it("should execute analytics query", async () => {
    const store = new MemoryAnalyticsStore();
    await store.init();
    const engine = new AnalyticsQueryEngine(store);
    const wrapper = createWrapper(store);

    // Add test data
    const { result: addResult } = renderHook(() => useAddSeriesValue(), {
      wrapper,
    });

    await addResult.current.mutateAsync({
      start: DateTime.now(),
      source: TEST_SOURCE,
      value: 10000,
      unit: "DAI",
      metric: "Budget",
      dimensions: {
        budget: AnalyticsPath.fromString("atlas/legacy/core-units/SES-001"),
      },
    });

    const query: AnalyticsQuery = {
      start: DateTime.now().minus({ days: 1 }),
      end: DateTime.now().plus({ days: 1 }),
      granularity: AnalyticsGranularity.Total,
      lod: {},
      metrics: ["Budget"],
      currency: AnalyticsPath.fromString("DAI"),
      select: {
        budget: [AnalyticsPath.fromString("atlas/legacy/core-units/SES-001")],
      },
    };

    // Test analytics query
    const { result } = renderHook(() => useAnalyticsQuery(query), { wrapper });

    await vi.waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Get result directly from engine for comparison
    const engineResult = await engine.execute(query);

    expect(result.current.data).toStrictEqual(engineResult);
  });

  it("should get dimensions", async () => {
    const store = new MemoryAnalyticsStore();
    await store.init();
    const wrapper = createWrapper(store);

    // Add test data
    const { result: addResult } = renderHook(() => useAddSeriesValue(), {
      wrapper,
    });

    await addResult.current.mutateAsync({
      start: DateTime.now(),
      source: TEST_SOURCE,
      value: 10000,
      unit: "DAI",
      metric: "Budget",
      dimensions: {
        budget: AnalyticsPath.fromString("atlas/legacy/core-units/SES-001"),
      },
    });

    const { result } = renderHook(() => useGetDimensions(), { wrapper });

    await vi.waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toStrictEqual(await store.getDimensions());
  });
});
