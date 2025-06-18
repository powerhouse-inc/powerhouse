import { type BrowserAnalyticsStore } from "@powerhousedao/analytics-engine-browser";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type PropsWithChildren, useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "vitest-browser-react";
import {
  type AnalyticsDimension,
  AnalyticsGranularity,
  AnalyticsPath,
  AnalyticsProvider,
  type AnalyticsQuery,
  AnalyticsQueryEngine,
  DateTime,
  useAddSeriesValue,
  useAnalyticsQuery,
  useAnalyticsSeries,
  useCreateAnalyticsStore,
  useGetDimensions,
} from "../src/analytics/analytics.js";
import { MemoryAnalyticsStore } from "../src/analytics/store/memory.js";
import { clearGlobal, getGlobal } from "../src/global/core.js";

describe("Analytics Store", () => {
  const TEST_SOURCE = AnalyticsPath.fromString(
    "test/analytics/AnalyticsStore.spec",
  );

  function CreateAnalyticsStore({ databaseName }: { databaseName: string }) {
    const { mutate } = useCreateAnalyticsStore({
      databaseName,
    });
    useEffect(() => {
      mutate();
    }, [databaseName]);
    return null;
  }

  function createWrapper() {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: true,
          retryDelay: 1000,
        },
      },
    });

    const databaseName = Date.now().toString();

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

    await vi.waitFor(() =>
      expect(queryResult.current.status).not.toBe("pending"),
    );

    expect(queryResult.current.error).toMatchObject({
      message: "No analytics store available. Use within an AnalyticsProvider.",
    });
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
});
