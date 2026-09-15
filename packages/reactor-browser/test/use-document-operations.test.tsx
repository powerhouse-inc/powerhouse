import type { PagedResults } from "@powerhousedao/reactor";
import type { Operation } from "@powerhousedao/shared/document-model";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { DocumentCache } from "../src/document-cache.js";
import { ensurePHEventHandlers } from "../src/graphql-client/graphql-reactor-provider.js";
import { setDocumentCache } from "../src/hooks/document-cache.js";
import { useDocumentOperations } from "../src/hooks/document-operations.js";
import type { IDocumentCache } from "../src/types/documents.js";
import type { IReactorBrowserClient } from "../src/types/reactor-browser-client.js";

/**
 * The shape of `IReactorBrowserClient["getOperations"]`, spelled out so
 * `vi.fn<GetOperations>` keeps `.mock.calls[n]` indexable at every
 * parameter position even when a test's implementation ignores most of them.
 */
type GetOperations = (
  documentId: string,
  view?: { scopes?: string[] },
  filter?: unknown,
  paging?: { cursor: string; limit: number },
  signal?: AbortSignal,
) => Promise<PagedResults<Operation>>;

function createFakeOperation(index: number, scope = "global"): Operation {
  return {
    id: `op-${scope}-${index}`,
    index,
    skip: 0,
    hash: `hash-${index}`,
    timestampUtcMs: new Date(0).toISOString(),
    action: {
      id: `action-${scope}-${index}`,
      type: "INCREMENT",
      input: {},
      scope,
      timestampUtcMs: new Date(0).toISOString(),
    },
  } as Operation;
}

function makePage(
  results: Operation[],
  nextCursor?: string,
  totalCount?: number,
): PagedResults<Operation> {
  return {
    results,
    options: { cursor: "", limit: results.length },
    nextCursor,
    totalCount,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeCache(getOperations: IReactorBrowserClient["getOperations"]) {
  const client = {
    get: vi.fn(),
    subscribe: () => () => undefined,
    getOperations,
  } as unknown as IReactorBrowserClient;
  return new DocumentCache(client);
}

function Probe(props: {
  id: string | null;
  scope?: string;
  enabled?: boolean;
  limit?: number;
  /** Called with the `operations` array on every render, for identity checks. */
  onOperations?: (operations: readonly Operation[]) => void;
}) {
  const { id, scope = "global", enabled, limit, onOperations } = props;
  const result = useDocumentOperations(id, scope, { enabled, limit });
  onOperations?.(result.operations);
  return (
    <div>
      <span data-testid="loading">{String(result.isLoading)}</span>
      <span data-testid="count">{result.operations.length}</span>
      <span data-testid="indexes">
        {result.operations.map((op) => op.index).join(",")}
      </span>
      <span data-testid="has-next">{String(result.hasNextPage)}</span>
      <span data-testid="total">{result.totalCount ?? ""}</span>
      <span data-testid="error">{result.error?.message ?? ""}</span>
      <button data-testid="next" onClick={result.fetchNextPage} />
      <button data-testid="refetch" onClick={result.refetch} />
    </div>
  );
}

function textOf(screen: ReturnType<typeof render>, testId: string) {
  return (
    screen.container.querySelector(`[data-testid=${testId}]`)?.textContent ?? ""
  );
}

function click(screen: ReturnType<typeof render>, testId: string) {
  (
    screen.container.querySelector(
      `[data-testid=${testId}]`,
    ) as HTMLButtonElement
  ).click();
}

describe("useDocumentOperations", () => {
  beforeEach(() => {
    window.ph = {};
    delete window.__phEventHandlersRegistered;
    ensurePHEventHandlers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.ph = {};
    delete window.__phEventHandlersRegistered;
  });

  it("loads the first page once and reports it", async () => {
    const getOperations = vi.fn<GetOperations>(() =>
      Promise.resolve(
        makePage([createFakeOperation(0), createFakeOperation(1)]),
      ),
    );
    setDocumentCache(makeCache(getOperations));

    const screen = render(
      <StrictMode>
        <Probe id="doc-1" limit={25} />
      </StrictMode>,
    );
    expect(textOf(screen, "loading")).toBe("true");
    await vi.waitFor(() => {
      expect(textOf(screen, "loading")).toBe("false");
    });
    expect(textOf(screen, "indexes")).toBe("0,1");
    expect(textOf(screen, "has-next")).toBe("false");
    expect(getOperations).toHaveBeenCalledTimes(1);
    expect(getOperations.mock.calls[0][1]).toEqual({ scopes: ["global"] });
    expect(getOperations.mock.calls[0][3]).toEqual({ cursor: "", limit: 25 });
  });

  it("reports an empty page as a final, non-loading result without retrying", async () => {
    const getOperations = vi.fn(() => Promise.resolve(makePage([])));
    setDocumentCache(makeCache(getOperations));

    const screen = render(<Probe id="doc-1" />);
    await vi.waitFor(() => {
      expect(textOf(screen, "loading")).toBe("false");
    });
    expect(textOf(screen, "count")).toBe("0");
    // Give a hypothetical retry timer room to fire; it must not.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(getOperations).toHaveBeenCalledTimes(1);
  });

  it("does not fetch when disabled or when the id is empty", async () => {
    const getOperations = vi.fn(() => Promise.resolve(makePage([])));
    setDocumentCache(makeCache(getOperations));

    const disabled = render(<Probe id="doc-1" enabled={false} />);
    const noId = render(<Probe id={null} />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(getOperations).not.toHaveBeenCalled();
    expect(textOf(disabled, "loading")).toBe("false");
    expect(textOf(noId, "loading")).toBe("false");
    expect(textOf(disabled, "count")).toBe("0");
    expect(textOf(disabled, "error")).toBe("");
  });

  it("starts fetching once enabled flips to true", async () => {
    const getOperations = vi.fn(() =>
      Promise.resolve(makePage([createFakeOperation(0)])),
    );
    setDocumentCache(makeCache(getOperations));

    const screen = render(<Probe id="doc-1" enabled={false} />);
    expect(getOperations).not.toHaveBeenCalled();
    screen.rerender(<Probe id="doc-1" enabled={true} />);
    await vi.waitFor(() => {
      expect(textOf(screen, "count")).toBe("1");
    });
  });

  it("fetches a different scope when the scope changes", async () => {
    const getOperations = vi.fn((_: string, view?: { scopes?: string[] }) =>
      Promise.resolve(makePage([createFakeOperation(0, view?.scopes?.[0])])),
    );
    setDocumentCache(makeCache(getOperations));

    const screen = render(<Probe id="doc-1" scope="global" />);
    await vi.waitFor(() => {
      expect(textOf(screen, "count")).toBe("1");
    });
    screen.rerender(<Probe id="doc-1" scope="local" />);
    await vi.waitFor(() => {
      expect(getOperations).toHaveBeenCalledTimes(2);
    });
    expect(getOperations.mock.calls[1][1]).toEqual({ scopes: ["local"] });
  });

  it("appends the next page on fetchNextPage", async () => {
    const getOperations = vi.fn(
      (
        _id: string,
        _view?: { scopes?: string[] },
        _filter?: unknown,
        paging?: { cursor: string; limit: number },
      ) =>
        Promise.resolve(
          paging?.cursor === "c1"
            ? makePage([createFakeOperation(2)])
            : makePage([createFakeOperation(0), createFakeOperation(1)], "c1"),
        ),
    );
    setDocumentCache(makeCache(getOperations));

    const screen = render(<Probe id="doc-1" />);
    await vi.waitFor(() => {
      expect(textOf(screen, "has-next")).toBe("true");
    });
    click(screen, "next");
    await vi.waitFor(() => {
      expect(textOf(screen, "indexes")).toBe("0,1,2");
    });
    expect(textOf(screen, "has-next")).toBe("false");
    expect(getOperations).toHaveBeenCalledTimes(2);
    expect(getOperations.mock.calls[1][3]).toEqual({
      cursor: "c1",
      limit: 100,
    });
  });

  it("refetch reloads from the first page", async () => {
    const getOperations = vi.fn(() =>
      Promise.resolve(makePage([createFakeOperation(0)])),
    );
    setDocumentCache(makeCache(getOperations));

    const screen = render(<Probe id="doc-1" />);
    await vi.waitFor(() => {
      expect(textOf(screen, "count")).toBe("1");
    });
    click(screen, "refetch");
    // Invalidation drops the entry and notifies synchronously, but the raw
    // DOM `.click()` above isn't wrapped in `act()`, so React's re-render
    // lands a microtask later rather than before `.click()` returns; one
    // microtask turn is enough - no macrotask/network wait is needed. The
    // hook must report loading well before the refetch settles, with no
    // "no operations" frame in between.
    await Promise.resolve();
    expect(textOf(screen, "loading")).toBe("true");
    await vi.waitFor(() => {
      expect(getOperations).toHaveBeenCalledTimes(2);
    });
    await vi.waitFor(() => {
      expect(textOf(screen, "loading")).toBe("false");
    });
    expect(textOf(screen, "count")).toBe("1");
  });

  it("surfaces a failed page as an Error", async () => {
    // Covers the pass-through branch of `toError`, where the rejection
    // reason already is an Error.
    const getOperations = vi.fn(() => Promise.reject(new Error("nope")));
    setDocumentCache(makeCache(getOperations));

    const screen = render(<Probe id="doc-1" />);
    await vi.waitFor(() => {
      expect(textOf(screen, "error")).toBe("nope");
    });
    expect(textOf(screen, "loading")).toBe("false");
  });

  it("surfaces a non-Error rejection reason via toError's String(reason) fallback", async () => {
    // `@typescript-eslint/prefer-promise-reject-errors` (type-aware) flags
    // `Promise.reject(nonError)` and `reject(nonError)` inside a `new
    // Promise` executor, but not `vi.fn().mockRejectedValue(nonError)` -
    // that's a mock config call, not a `Promise.reject`/`NewExpression`
    // the rule inspects - so this exercises the fallback without an
    // eslint-disable.
    const getOperations = vi.fn().mockRejectedValue("nope");
    setDocumentCache(makeCache(getOperations));

    const screen = render(<Probe id="doc-1" />);
    await vi.waitFor(() => {
      expect(textOf(screen, "error")).toBe("nope");
    });
    expect(textOf(screen, "loading")).toBe("false");
  });

  it("passes totalCount through from the page", async () => {
    const getOperations = vi.fn(() =>
      Promise.resolve(makePage([createFakeOperation(0)], undefined, 42)),
    );
    setDocumentCache(makeCache(getOperations));

    const screen = render(<Probe id="doc-1" />);
    await vi.waitFor(() => {
      expect(textOf(screen, "total")).toBe("42");
    });
  });

  it("returns the same operations array across an identical rerender", async () => {
    const getOperations = vi.fn(() =>
      Promise.resolve(makePage([createFakeOperation(0)])),
    );
    setDocumentCache(makeCache(getOperations));

    const captured: (readonly Operation[])[] = [];
    const onOperations = (operations: readonly Operation[]) => {
      captured.push(operations);
    };

    const screen = render(<Probe id="doc-1" onOperations={onOperations} />);
    await vi.waitFor(() => {
      expect(textOf(screen, "count")).toBe("1");
    });
    const afterSuccess = captured[captured.length - 1];

    screen.rerender(<Probe id="doc-1" onOperations={onOperations} />);
    const afterRerender = captured[captured.length - 1];

    expect(afterRerender).toBe(afterSuccess);
  });

  it("returns an empty result when the cache has no operations support", async () => {
    const documentsOnly = {
      get: vi.fn(),
      getBatch: vi.fn(),
      subscribe: () => () => undefined,
    } as unknown as IDocumentCache;
    setDocumentCache(documentsOnly);

    const screen = render(<Probe id="doc-1" />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(textOf(screen, "loading")).toBe("false");
    expect(textOf(screen, "count")).toBe("0");
    expect(textOf(screen, "error")).toBe("");
  });

  it("shares one cache entry between two hooks on the same scope", async () => {
    const { promise, resolve } = deferred<PagedResults<Operation>>();
    const getOperations = vi.fn(() => promise);
    setDocumentCache(makeCache(getOperations));

    const screen = render(
      <>
        <Probe id="doc-1" />
        <Probe id="doc-1" />
      </>,
    );
    expect(getOperations).toHaveBeenCalledTimes(1);
    resolve(makePage([createFakeOperation(0)]));
    await vi.waitFor(() => {
      const counts = Array.from(
        screen.container.querySelectorAll("[data-testid=count]"),
      ).map((el) => el.textContent);
      expect(counts).toEqual(["1", "1"]);
    });
  });
});

function LegacyProbe({ id }: { id: string | null }) {
  const result = useDocumentOperations(id);
  return (
    <div>
      <span data-testid="loading">{String(result.isLoading)}</span>
      <span data-testid="global">
        {result.globalOperations.map((op) => op.index).join(",")}
      </span>
      <span data-testid="local">
        {result.localOperations.map((op) => op.index).join(",")}
      </span>
      <span data-testid="error">{result.error?.message ?? ""}</span>
      <button data-testid="refetch" onClick={result.refetch} />
    </div>
  );
}

describe("useDocumentOperations (legacy form)", () => {
  beforeEach(() => {
    window.ph = {};
    delete window.__phEventHandlersRegistered;
    ensurePHEventHandlers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.ph = {};
    delete window.__phEventHandlersRegistered;
  });

  it("fetches both scopes and pages each to completion", async () => {
    const getOperations = vi.fn<GetOperations>((_id, view, _filter, paging) => {
      const scope = view?.scopes?.[0];
      if (scope === "local") {
        return Promise.resolve(makePage([createFakeOperation(0, "local")]));
      }
      if (paging?.cursor === "g1") {
        return Promise.resolve(makePage([createFakeOperation(2)]));
      }
      return Promise.resolve(
        makePage([createFakeOperation(0), createFakeOperation(1)], "g1"),
      );
    });
    setDocumentCache(makeCache(getOperations));

    const screen = render(<LegacyProbe id="doc-1" />);
    expect(textOf(screen, "loading")).toBe("true");
    await vi.waitFor(() => {
      expect(textOf(screen, "loading")).toBe("false");
    });
    expect(textOf(screen, "global")).toBe("0,1,2");
    expect(textOf(screen, "local")).toBe("0");
    expect(getOperations).toHaveBeenCalledTimes(3);
  });

  it("stays loading until every page of both scopes has arrived", async () => {
    const { promise: secondPage, resolve: resolveSecondPage } =
      deferred<PagedResults<Operation>>();
    const getOperations = vi.fn<GetOperations>((_id, view, _filter, paging) => {
      const scope = view?.scopes?.[0];
      if (scope === "local") {
        return Promise.resolve(makePage([createFakeOperation(0, "local")]));
      }
      if (paging?.cursor === "g1") {
        return secondPage;
      }
      return Promise.resolve(
        makePage([createFakeOperation(0), createFakeOperation(1)], "g1"),
      );
    });
    setDocumentCache(makeCache(getOperations));

    const screen = render(<LegacyProbe id="doc-1" />);
    await vi.waitFor(() => {
      // local settled, global's first page settled, and its second page
      // (triggered by useLoadAllPages once hasNextPage is true) requested.
      expect(getOperations).toHaveBeenCalledTimes(3);
    });
    expect(textOf(screen, "loading")).toBe("true");
    resolveSecondPage(makePage([createFakeOperation(2)]));
    await vi.waitFor(() => {
      expect(textOf(screen, "loading")).toBe("false");
    });
    expect(textOf(screen, "global")).toBe("0,1,2");
  });

  it("returns empty arrays and not loading for a null id", async () => {
    const getOperations = vi.fn(() => Promise.resolve(makePage([])));
    setDocumentCache(makeCache(getOperations));

    const screen = render(<LegacyProbe id={null} />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(textOf(screen, "loading")).toBe("false");
    expect(textOf(screen, "global")).toBe("");
    expect(textOf(screen, "local")).toBe("");
    expect(getOperations).not.toHaveBeenCalled();
  });

  it("refetch reloads both scopes", async () => {
    const getOperations = vi.fn<GetOperations>((_id, view) => {
      const scope = view?.scopes?.[0];
      return Promise.resolve(makePage([createFakeOperation(0, scope)]));
    });
    setDocumentCache(makeCache(getOperations));

    const screen = render(<LegacyProbe id="doc-1" />);
    await vi.waitFor(() => {
      expect(textOf(screen, "loading")).toBe("false");
    });
    const callsBefore = getOperations.mock.calls.length;
    click(screen, "refetch");
    await vi.waitFor(() => {
      expect(getOperations.mock.calls.length).toBe(callsBefore * 2);
    });
    await vi.waitFor(() => {
      expect(textOf(screen, "loading")).toBe("false");
    });
    expect(textOf(screen, "global")).toBe("0");
    expect(textOf(screen, "local")).toBe("0");
  });

  it("the scoped form is unaffected", async () => {
    // Existing suite (`describe("useDocumentOperations")` above) already
    // covers the scoped form thoroughly; this is a single smoke test to
    // confirm the two-argument call still works from the same module now
    // that the export carries an overload.
    const getOperations = vi.fn(() =>
      Promise.resolve(makePage([createFakeOperation(0)])),
    );
    setDocumentCache(makeCache(getOperations));

    const screen = render(<Probe id="doc-1" scope="global" />);
    await vi.waitFor(() => {
      expect(textOf(screen, "count")).toBe("1");
    });
  });

  it("globalOperations is a stable, mutable array across an identical rerender", async () => {
    const getOperations = vi.fn(() =>
      Promise.resolve(
        makePage([createFakeOperation(0), createFakeOperation(1)]),
      ),
    );
    setDocumentCache(makeCache(getOperations));

    const captured: Operation[][] = [];
    function CaptureProbe({ id }: { id: string }) {
      const result = useDocumentOperations(id);
      captured.push(result.globalOperations);
      // Type-level proof: `globalOperations` is `Operation[]`, not
      // `readonly Operation[]` - `.sort()` is not callable on the latter.
      const sorted = result.globalOperations
        .slice()
        .sort((a, b) => a.index - b.index);
      return <span data-testid="sorted-count">{sorted.length}</span>;
    }

    const screen = render(<CaptureProbe id="doc-1" />);
    await vi.waitFor(() => {
      expect(textOf(screen, "sorted-count")).toBe("2");
    });
    const afterSuccess = captured[captured.length - 1];

    screen.rerender(<CaptureProbe id="doc-1" />);
    const afterRerender = captured[captured.length - 1];

    expect(afterRerender).toBe(afterSuccess);
  });
});
