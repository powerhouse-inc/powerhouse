import type { PHDocument } from "document-model";
import { StrictMode, Suspense, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { ensurePHEventHandlers } from "../src/graphql-client/graphql-reactor-provider.js";
import { createClient } from "../src/graphql/client.js";
import { documentCacheClientMiddleware } from "../src/graphql/document-cache-client-middleware.js";
import { GraphQLClientDocumentCache } from "../src/graphql/graphql-client-document-cache.js";
import {
  setDocumentCache,
  useDocument,
  useDocumentSafe,
} from "../src/hooks/document-cache.js";

// The real graphql-request SDK and cache middleware; only `fetch` is replaced,
// by an in-memory switchboard whose GetDocument answers can be held or failed.
const url = "http://switchboard.test/graphql";

type GraphQLBody = { query: string; variables: Record<string, unknown> };

function stubSwitchboard() {
  const names = new Map<string, string>();
  const held = new Map<string, number>();
  let gate: Promise<void> | undefined;
  let release: () => void = () => undefined;
  let outageNext = false;
  let onHeld: (() => void) | undefined;

  function payload(id: string, name: string) {
    return {
      id,
      slug: id,
      name: id,
      documentType: "powerhouse/test",
      state: { global: { name }, local: {} },
      revisionsList: [{ scope: "global", revision: 1 }],
      createdAtUtcIso: "2026-01-01T00:00:00.000Z",
      lastModifiedAtUtcIso: "2026-01-02T00:00:00.000Z",
    };
  }

  function json(body: unknown) {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
    const body = JSON.parse(init?.body as string) as GraphQLBody;
    if (body.query.includes("mutation MutateDocument(")) {
      const id = body.variables.documentIdentifier as string;
      const [action] = body.variables.actions as {
        input: { name: string };
      }[];
      names.set(id, action.input.name);
      return json({ data: { mutateDocument: payload(id, action.input.name) } });
    }
    if (!body.query.includes("query GetDocument(")) {
      return json({ data: null, errors: [{ message: "unexpected request" }] });
    }
    const id = body.variables.identifier as string;
    // Read before holding, so a held answer is the state at request time.
    const name = names.get(id);
    const outage = outageNext;
    outageNext = false;
    if (gate) {
      held.set(id, (held.get(id) ?? 0) + 1);
      onHeld?.();
      await gate;
    }
    if (outage) {
      throw new TypeError("Failed to fetch");
    }
    if (name === undefined) {
      // What reactor-api's `document` resolver answers for a missing id.
      return json({
        data: null,
        errors: [
          { message: `Failed to fetch document: Document not found: ${id}` },
        ],
      });
    }
    return json({
      data: { document: { document: payload(id, name), childIds: [] } },
    });
  });

  return {
    put: (id: string, name: string) => names.set(id, name),
    remove: (id: string) => names.delete(id),
    heldCount: (id: string) => held.get(id) ?? 0,
    failNextRead() {
      outageNext = true;
    },
    hold() {
      gate = new Promise<void>((resolve) => {
        release = resolve;
      });
    },
    open() {
      gate = undefined;
      release();
    },
    whenHeld(id: string) {
      return new Promise<void>((resolve) => {
        const check = () => {
          if ((held.get(id) ?? 0) > 0) resolve();
        };
        onHeld = check;
        check();
      });
    },
  };
}

function nameOf(document: PHDocument | undefined) {
  return (document?.state as { global?: { name?: string } } | undefined)?.global
    ?.name;
}

type RenderEntry = { id: string; documentId: string | undefined };

function Editor({ id, log }: { id: string; log: RenderEntry[] }) {
  const document = useDocument(id);
  const [draft, setDraft] = useState("");
  log.push({ id, documentId: document?.header.id });
  return (
    <div data-testid="content" data-document-id={document?.header.id}>
      <span data-testid="name">{nameOf(document)}</span>
      <input
        data-testid="draft"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
    </div>
  );
}

type SafeState = ReturnType<typeof useDocumentSafe>;

function SafeProbe({ id, states }: { id: string; states: SafeState[] }) {
  states.push(useDocumentSafe(id));
  return null;
}

function Fallback({ onRender }: { onRender: () => void }) {
  onRender();
  return <div data-testid="fallback">Loading</div>;
}

function Boundary({
  children,
  onFallback,
}: {
  children: ReactNode;
  onFallback: () => void;
}) {
  return (
    <StrictMode>
      <Suspense fallback={<Fallback onRender={onFallback} />}>
        {children}
      </Suspense>
    </StrictMode>
  );
}

function query(container: HTMLElement, testId: string) {
  return container.querySelector<HTMLElement>(`[data-testid=${testId}]`);
}

// A plain root, outside `act`, so Suspense retries run as in the app.
function mount(node: ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  root.render(node);
  return {
    container,
    rerender: (next: ReactNode) => root.render(next),
    unmount: () => {
      root.unmount();
      container.remove();
    },
  };
}

// Present and not hidden by a Suspense boundary.
function isVisible(element: HTMLElement | null) {
  return !!element && getComputedStyle(element).display !== "none";
}

let nextId = 0;
function uniqueId(label: string) {
  nextId += 1;
  return `${label}-${nextId}-${Date.now().toString(36)}`;
}

describe("GraphQLClientDocumentCache under an outer Suspense boundary", () => {
  let switchboard: ReturnType<typeof stubSwitchboard>;
  let cache: GraphQLClientDocumentCache;
  let screen: ReturnType<typeof mount> | undefined;

  beforeEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = false;
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    window.ph = {};
    delete window.__phEventHandlersRegistered;
    ensurePHEventHandlers();
    switchboard = stubSwitchboard();
    window.ph.reactorGraphQLClient = createClient(
      url,
      documentCacheClientMiddleware,
    );
    cache = new GraphQLClientDocumentCache();
    setDocumentCache(cache);
  });

  afterEach(() => {
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT;
    screen?.unmount();
    screen = undefined;
    switchboard.open();
    vi.restoreAllMocks();
    window.ph = {};
    delete window.__phEventHandlersRegistered;
  });

  function show(node: ReactNode) {
    screen = mount(node);
    return screen;
  }

  function rename(id: string, name: string) {
    return window.ph!.reactorGraphQLClient!.MutateDocument({
      documentIdentifier: id,
      actions: [
        {
          id: uniqueId("action"),
          type: "SET_NAME",
          input: { name },
          scope: "global",
          timestampUtcMs: String(Date.now()),
        },
      ],
    });
  }

  it("keeps revealed content mounted while a mutation refetches", async () => {
    const id = uniqueId("doc");
    switchboard.put(id, "Before");
    let fallbackRenders = 0;
    const view = show(
      <Boundary onFallback={() => fallbackRenders++}>
        <Editor id={id} log={[]} />
      </Boundary>,
    );
    await vi.waitFor(() => {
      expect(query(view.container, "name")?.textContent).toBe("Before");
    });
    const input = query(view.container, "draft") as HTMLInputElement;
    await userEvent.click(input);
    fallbackRenders = 0;

    switchboard.hold();
    await rename(id, "After");
    await switchboard.whenHeld(id);
    expect(cache.getRefetchState(id).isRefetching).toBe(true);
    await userEvent.keyboard("a");

    expect(fallbackRenders).toBe(0);
    expect(isVisible(query(view.container, "content"))).toBe(true);
    expect(query(view.container, "draft")).toBe(input);
    expect(globalThis.document.activeElement).toBe(input);

    switchboard.open();
    await vi.waitFor(() => {
      expect(query(view.container, "name")?.textContent).toBe("After");
    });
    expect(fallbackRenders).toBe(0);
    expect(input.value).toBe("a");
    expect(cache.getRefetchState(id).isRefetching).toBe(false);
  });

  it("lands on the latest of two mutations made during one refetch", async () => {
    const id = uniqueId("doc");
    switchboard.put(id, "Zero");
    const view = show(
      <Boundary onFallback={() => undefined}>
        <Editor id={id} log={[]} />
      </Boundary>,
    );
    await vi.waitFor(() => {
      expect(query(view.container, "name")?.textContent).toBe("Zero");
    });

    switchboard.hold();
    await rename(id, "One");
    await switchboard.whenHeld(id);
    await rename(id, "Two");
    await new Promise((resolve) => setTimeout(resolve, 50));
    // The second mutation queues behind the held refetch.
    expect(switchboard.heldCount(id)).toBe(1);

    switchboard.open();
    await vi.waitFor(() => {
      expect(query(view.container, "name")?.textContent).toBe("Two");
    });
  });

  it("never renders the previous document once the id changes", async () => {
    const first = uniqueId("first");
    const second = uniqueId("second");
    switchboard.put(first, "First");
    switchboard.put(second, "Second");
    const log: RenderEntry[] = [];
    const app = (id: string) => (
      <Boundary onFallback={() => undefined}>
        <Editor id={id} log={log} />
      </Boundary>
    );
    const view = show(app(first));
    await vi.waitFor(() => {
      expect(query(view.container, "name")?.textContent).toBe("First");
    });

    switchboard.hold();
    view.rerender(app(second));
    await switchboard.whenHeld(second);

    const content = query(view.container, "content");
    expect(isVisible(content) && content?.dataset.documentId === first).toBe(
      false,
    );

    switchboard.open();
    await vi.waitFor(() => {
      expect(query(view.container, "name")?.textContent).toBe("Second");
    });
    const stale = log.filter(
      (entry) =>
        entry.id === second &&
        entry.documentId !== undefined &&
        entry.documentId !== second,
    );
    expect(stale).toEqual([]);
  });

  it("drops the document when its refetch finds it gone", async () => {
    const id = uniqueId("doc");
    switchboard.put(id, "Doomed");
    const states: SafeState[] = [];
    show(<SafeProbe id={id} states={states} />);
    await vi.waitFor(() => {
      expect(states.at(-1)?.status).toBe("success");
    });

    switchboard.remove(id);
    await expect(states.at(-1)!.reload!()).rejects.toThrow(
      "Document not found",
    );
    await vi.waitFor(() => {
      expect(states.at(-1)?.status).toBe("error");
    });
    expect(states.at(-1)?.data).toBeUndefined();
    expect(states.at(-1)?.isRefetching).toBe(false);
  });

  it("keeps the document and exposes the error when a refetch fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const id = uniqueId("doc");
    switchboard.put(id, "Kept");
    const states: SafeState[] = [];
    let fallbackRenders = 0;
    const view = show(
      <Boundary onFallback={() => fallbackRenders++}>
        <Editor id={id} log={[]} />
        <SafeProbe id={id} states={states} />
      </Boundary>,
    );
    await vi.waitFor(() => {
      expect(states.at(-1)?.status).toBe("success");
    });
    fallbackRenders = 0;

    switchboard.failNextRead();
    await rename(id, "Unseen");
    await vi.waitFor(() => {
      expect(states.at(-1)?.refetchError).toBeInstanceOf(Error);
    });
    const last = states.at(-1)!;
    expect(last.status).toBe("success");
    expect(last.error).toBeUndefined();
    expect(last.isRefetching).toBe(false);
    expect(nameOf(last.data)).toBe("Kept");
    expect(isVisible(query(view.container, "content"))).toBe(true);
    expect(fallbackRenders).toBe(0);
    expect(warn).toHaveBeenCalled();

    await rename(id, "Recovered");
    await vi.waitFor(() => {
      expect(states.at(-1)?.refetchError).toBeUndefined();
      expect(nameOf(states.at(-1)?.data)).toBe("Recovered");
    });
  });
});
