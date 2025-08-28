import type { BrowserAnalyticsStore } from "@powerhousedao/analytics-engine-browser";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "vitest-browser-react";
import type {
  AnalyticsDimension,
  AnalyticsQuery,
} from "../src/analytics/analytics.js";
import {
  AnalyticsGranularity,
  AnalyticsPath,
  AnalyticsProvider,
  AnalyticsQueryEngine,
  DateTime,
  useAddSeriesValue,
  useAnalyticsQuery,
  useAnalyticsSeries,
  useGetDimensions,
} from "../src/analytics/analytics.js";
import { MemoryAnalyticsStore } from "../src/analytics/store/memory.js";
import { clearGlobal, getGlobal, setGlobal } from "../src/global/core.js";

describe("Analytics Store", () => {
  const TEST_SOURCE = AnalyticsPath.fromString(
    "test/analytics/AnalyticsStore.spec",
  );

  function createWrapper() {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: true,
        },
      },
    });

    const store = new MemoryAnalyticsStore();
    const databaseName = Date.now().toString();
    setGlobal(
      "analytics",
      store.init().then(() => {
        const engine = new AnalyticsQueryEngine(store);
        return { store, engine, options: { databaseName } };
      }),
    );

    return function Wrapper({ children }: { children: React.ReactNode }) {
      return (
        <AnalyticsProvider
          databaseName={databaseName}
          queryClient={queryClient}
        >
          {children}
        </AnalyticsProvider>
      );
    };
  }

  async function resetGlobalAnalytics() {
    const store = (await getGlobal("analytics"))?.store as
      | BrowserAnalyticsStore
      | undefined;
    await store?.destroy();
    clearGlobal("analytics");
  }

  beforeEach(async () => {
    await resetGlobalAnalytics();
  });

  it("should add and query analytics data", async () => {
    const wrapper = createWrapper();

    const { result: addResult, act } = renderHook(() => useAddSeriesValue(), {
      wrapper,
    });

    act(() => {
      addResult.current.mutate({
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

    await vi.waitFor(() => expect(queryResult.current.status).toBe("success"));

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
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: {
              queries: {
                retry: false,
              },
            },
          })
        }
      >
        {children}
      </QueryClientProvider>
    );
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
        useAnalyticsSeries(
          {
            start: null,
            end: null,
            currency: AnalyticsPath.fromString("DAI"),
            metrics: ["Budget"],
            select: {
              budget: [
                AnalyticsPath.fromString("atlas/legacy/core-units/SES-001"),
              ],
            },
          },
          { enabled: true },
        ),
      { wrapper },
    );

    await vi.waitFor(() =>
      expect(queryResult.current.error).toMatchObject({
        message:
          "No analytics store available. Use within an AnalyticsProvider.",
      }),
    );
  });

  it("should execute analytics query", async () => {
    const store = new MemoryAnalyticsStore();
    await store.init();
    const engine = new AnalyticsQueryEngine(store);
    const wrapper = createWrapper();

    // Add test data
    const { result: addResult } = renderHook(() => useAddSeriesValue(), {
      wrapper,
    });

    const addValue = {
      start: DateTime.now(),
      source: TEST_SOURCE,
      value: 10000,
      unit: "DAI",
      metric: "Budget",
      dimensions: {
        budget: AnalyticsPath.fromString("atlas/legacy/core-units/SES-001"),
      },
    };
    await store.addSeriesValue(addValue);
    await addResult.current.mutateAsync(addValue);

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

    const wrapper = createWrapper();

    // Add test data
    const { result: addResult } = renderHook(() => useAddSeriesValue(), {
      wrapper,
    });

    const addValue = {
      start: DateTime.now(),
      source: TEST_SOURCE,
      value: 10000,
      unit: "DAI",
      metric: "Budget",
      dimensions: {
        budget: AnalyticsPath.fromString("atlas/legacy/core-units/SES-001"),
      },
    };

    await store.addSeriesValue(addValue);
    await addResult.current.mutateAsync(addValue);

    const { result } = renderHook(() => useGetDimensions(), { wrapper });

    await vi.waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toStrictEqual(await store.getDimensions());
  });

  it("should be notified when query data changes", async () => {
    const store = new MemoryAnalyticsStore();
    await store.init();

    const basePath = AnalyticsPath.fromString("atlas/legacy/core-units");
    const path = AnalyticsPath.fromString("atlas/legacy/core-units/SES-001");

    const query: AnalyticsQuery = {
      start: DateTime.now().minus({ days: 1 }),
      end: DateTime.now().plus({ days: 1 }),
      granularity: AnalyticsGranularity.Total,
      lod: {
        budget: 4,
      },
      metrics: ["Budget"],
      currency: AnalyticsPath.fromString("DAI"),
      select: {
        budget: [basePath],
      },
    };
    await expect(store.getMatchingSeries(query)).resolves.toHaveLength(0);
    const testSub = new Promise<number>((resolve) => {
      store.subscribeToSource(path, () => {
        console.log("Source changed");
        resolve(3);
      });
    });
    const addValue1 = {
      start: DateTime.now(),
      source: path,
      value: 10000,
      unit: "DAI",
      metric: "Budget",
      dimensions: {
        budget: path,
      },
    };
    await store.addSeriesValue(addValue1);
    console.log("added series value");

    await expect(store.getMatchingSeries(query)).resolves.toHaveLength(1);

    await vi.waitFor(() => expect(testSub).resolves.toEqual(3));
  });

  it("should refetch analytics query when data changes", async () => {
    const store = new MemoryAnalyticsStore();
    await store.init();
    const engine = new AnalyticsQueryEngine(store);
    const wrapper = createWrapper();

    const query: AnalyticsQuery = {
      start: DateTime.now().minus({ days: 1 }),
      end: DateTime.now().plus({ days: 1 }),
      granularity: AnalyticsGranularity.Total,
      lod: {
        budget: 4,
      },
      metrics: ["Budget"],
      currency: AnalyticsPath.fromString("DAI"),
      select: {
        budget: [AnalyticsPath.fromString("atlas/legacy/core-units")],
      },
    };

    // Test analytics query
    const { result } = renderHook(
      () => useAnalyticsQuery(query, { sources: [TEST_SOURCE] }),
      {
        wrapper,
      },
    );

    await vi.waitFor(() => expect(result.current.data).toStrictEqual([]));

    // Add test data
    const { result: addResult } = renderHook(() => useAddSeriesValue(), {
      wrapper,
    });

    const addValue = {
      start: DateTime.now(),
      source: TEST_SOURCE,
      value: 10000,
      unit: "DAI",
      metric: "Budget",
      dimensions: {
        budget: AnalyticsPath.fromString("atlas/legacy/core-units/SES-001"),
      },
    };
    await store.addSeriesValue(addValue);
    await addResult.current.mutateAsync(addValue);

    // Get result directly from engine for comparison
    const engineResult = await engine.execute(query);
    await vi.waitFor(() =>
      expect(result.current.data).toStrictEqual(engineResult),
    );
  });
});
