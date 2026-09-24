import {
  ReactorBuilder,
  ReactorClientBuilder,
  type InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import type {
  DocumentModelDocument,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import { setModelName } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { StrictMode, Suspense, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { DocumentCache } from "../src/document-cache.js";
import { ensurePHEventHandlers } from "../src/graphql-client/graphql-reactor-provider.js";
import {
  setDocumentCache,
  useDocument,
  useDocuments,
  useDocumentSafe,
} from "../src/hooks/document-cache.js";
import type { IReactorBrowserClient } from "../src/types/reactor-browser-client.js";

// A real client whose `get` can be held open (the SharedWorker round trip) or
// made to fail once. Every other member goes to the real client.
function withGatedGet(client: IReactorBrowserClient) {
  let gate: Promise<void> | undefined;
  let release: () => void = () => undefined;
  const held = new Map<string, number>();
  const inFlight = new Map<string, number>();
  let maxInFlight = 0;
  let onHeld: (() => void) | undefined;
  let nextFailure: (() => Promise<PHDocument>) | undefined;

  const gated = new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === "get") {
        return async (id: string) => {
          const failure = nextFailure;
          nextFailure = undefined;
          inFlight.set(id, (inFlight.get(id) ?? 0) + 1);
          maxInFlight = Math.max(maxInFlight, inFlight.get(id)!);
          try {
            // Read before holding, so a held answer is the state at request time.
            const result = failure ? failure() : target.get(id);
            await result.catch(() => undefined);
            if (gate) {
              held.set(id, (held.get(id) ?? 0) + 1);
              onHeld?.();
              await gate;
            }
            return await result;
          } finally {
            inFlight.set(id, inFlight.get(id)! - 1);
          }
        };
      }
      const value = Reflect.get(target, prop, receiver) as unknown;
      return typeof value === "function"
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value;
    },
  });

  return {
    client: gated,
    get maxInFlight() {
      return maxInFlight;
    },
    heldCount: (id: string) => held.get(id) ?? 0,
    // Holds every `get` that starts from now on until `open`.
    hold() {
      gate = new Promise<void>((resolve) => {
        release = resolve;
      });
    },
    open() {
      gate = undefined;
      release();
    },
    failNext(failure: () => Promise<PHDocument>) {
      nextFailure = failure;
    },
    whenHeld(id: string, count = 1) {
      return new Promise<void>((resolve) => {
        const check = () => {
          if ((held.get(id) ?? 0) >= count) resolve();
        };
        onHeld = check;
        check();
      });
    },
  };
}

type RenderEntry = { id: string; documentId: string | undefined };

function Editor({ id, log }: { id: string; log: RenderEntry[] }) {
  const document = useDocument(id) as DocumentModelDocument | undefined;
  const [draft, setDraft] = useState("");
  log.push({ id, documentId: document?.header.id });
  return (
    <div data-testid="content" data-document-id={document?.header.id}>
      <span data-testid="name">{document?.state.global.name}</span>
      <input
        data-testid="draft"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
    </div>
  );
}

function List({ ids, names }: { ids: string[]; names: string[] }) {
  const documents = useDocuments(ids) as DocumentModelDocument[];
  const [draft, setDraft] = useState("");
  names.push(documents.map((d) => d.state.global.name).join(","));
  return (
    <div data-testid="content">
      <span data-testid="name">
        {documents.map((d) => d.state.global.name).join(",")}
      </span>
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
  const state = useDocumentSafe(id);
  states.push(state);
  const document = state.data as DocumentModelDocument | undefined;
  return (
    <div data-testid="safe">
      <span data-testid="status">{state.status}</span>
      <span data-testid="name">{document?.state.global.name ?? ""}</span>
    </div>
  );
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

function App({
  id,
  log,
  onFallback,
}: {
  id: string;
  log: RenderEntry[];
  onFallback: () => void;
}) {
  return (
    <Boundary onFallback={onFallback}>
      <Editor id={id} log={log} />
    </Boundary>
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

function settle() {
  return new Promise((resolve) => setTimeout(resolve, 50));
}

describe("useDocument under an outer Suspense boundary", () => {
  let module: InProcessReactorClientModule;
  let gated: ReturnType<typeof withGatedGet>;
  let cache: DocumentCache;
  let screen: ReturnType<typeof mount> | undefined;

  beforeEach(async () => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = false;
    window.ph = {};
    delete window.__phEventHandlersRegistered;
    ensurePHEventHandlers();

    module = await new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder().withDocumentModelSources([
          documentModelDocumentModelModule,
        ]),
      )
      .buildModule();
    gated = withGatedGet(module.client);
    cache = new DocumentCache(gated.client);
    setDocumentCache(cache);
  });

  afterEach(async () => {
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT;
    screen?.unmount();
    screen = undefined;
    gated.open();
    cache.dispose();
    await module.reactor.kill().completed;
    window.ph = {};
    delete window.__phEventHandlersRegistered;
  });

  function show(node: ReactNode) {
    screen = mount(node);
    return screen;
  }

  async function createModel(name: string): Promise<PHDocument> {
    const document = documentModelDocumentModelModule.utils.createDocument();
    const created = await module.client.create(document);
    return module.client.execute(created.header.id, "main", [
      setModelName({ name }),
    ]);
  }

  function rename(id: string, name: string) {
    return module.client.execute(id, "main", [setModelName({ name })]);
  }

  it("keeps revealed content mounted while an update refetches", async () => {
    const document = await createModel("Before");
    const log: RenderEntry[] = [];
    let fallbackRenders = 0;
    const view = show(
      <App
        id={document.header.id}
        log={log}
        onFallback={() => fallbackRenders++}
      />,
    );

    await vi.waitFor(() => {
      expect(query(view.container, "name")?.textContent).toBe("Before");
    });
    const input = query(view.container, "draft") as HTMLInputElement;
    await userEvent.click(input);
    expect(globalThis.document.activeElement).toBe(input);
    fallbackRenders = 0;

    gated.hold();
    await rename(document.header.id, "After");
    await gated.whenHeld(document.header.id);

    // The user keeps typing while the refetch is in flight.
    await userEvent.keyboard("a");

    expect(fallbackRenders).toBe(0);
    expect(isVisible(query(view.container, "content"))).toBe(true);
    expect(query(view.container, "draft")).toBe(input);
    expect(globalThis.document.activeElement).toBe(input);

    gated.open();
    await vi.waitFor(() => {
      expect(query(view.container, "name")?.textContent).toBe("After");
    });
    expect(fallbackRenders).toBe(0);
    expect(input.value).toBe("a");
    expect(globalThis.document.activeElement).toBe(input);
  });

  it("never renders the previous document once the id changes", async () => {
    const first = await createModel("First");
    const second = await createModel("Second");
    const log: RenderEntry[] = [];
    const view = show(
      <App id={first.header.id} log={log} onFallback={() => undefined} />,
    );
    await vi.waitFor(() => {
      expect(query(view.container, "name")?.textContent).toBe("First");
    });

    gated.hold();
    view.rerender(
      <App id={second.header.id} log={log} onFallback={() => undefined} />,
    );
    await gated.whenHeld(second.header.id);

    // While the second document loads, the first must not be on screen.
    const content = query(view.container, "content");
    const showsFirst =
      isVisible(content) && content?.dataset.documentId === first.header.id;
    expect(showsFirst).toBe(false);

    gated.open();
    await vi.waitFor(() => {
      expect(query(view.container, "name")?.textContent).toBe("Second");
    });

    // No render, committed or not, pairs the new id with the old document.
    const stale = log.filter(
      (entry) =>
        entry.id === second.header.id &&
        entry.documentId !== undefined &&
        entry.documentId !== second.header.id,
    );
    expect(stale).toEqual([]);
  });

  it("still suspends on a first load", async () => {
    const document = await createModel("Loaded");
    gated.hold();
    let fallbackRenders = 0;
    const view = show(
      <App
        id={document.header.id}
        log={[]}
        onFallback={() => fallbackRenders++}
      />,
    );
    await gated.whenHeld(document.header.id);
    await settle();

    expect(fallbackRenders).toBeGreaterThan(0);
    expect(isVisible(query(view.container, "fallback"))).toBe(true);
    expect(query(view.container, "content")).toBeNull();

    gated.open();
    await vi.waitFor(() => {
      expect(query(view.container, "name")?.textContent).toBe("Loaded");
    });
  });

  it("lands on the latest of two updates made during one refetch", async () => {
    const document = await createModel("Zero");
    const id = document.header.id;
    const log: RenderEntry[] = [];
    let fallbackRenders = 0;
    const names: string[] = [];
    const view = show(
      <App id={id} log={log} onFallback={() => fallbackRenders++} />,
    );
    await vi.waitFor(() => {
      expect(query(view.container, "name")?.textContent).toBe("Zero");
    });
    fallbackRenders = 0;

    gated.hold();
    await rename(id, "One");
    await gated.whenHeld(id);
    await rename(id, "Two");
    await settle();

    // The second update queues behind the held refetch instead of racing it.
    expect(gated.heldCount(id)).toBe(1);
    expect(gated.maxInFlight).toBe(1);
    expect(cache.getRefetchState(id).isRefetching).toBe(true);

    const observer = new MutationObserver(() => {
      names.push(query(view.container, "name")?.textContent ?? "");
    });
    observer.observe(view.container, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    gated.open();
    await vi.waitFor(() => {
      expect(query(view.container, "name")?.textContent).toBe("Two");
    });
    await settle();
    observer.disconnect();

    expect(query(view.container, "name")?.textContent).toBe("Two");
    // Nothing older than "Two" is shown after it.
    expect(names.slice(names.indexOf("Two"))).not.toContain("One");
    expect(names.slice(names.indexOf("Two"))).not.toContain("Zero");
    expect(gated.maxInFlight).toBe(1);
    expect(cache.getRefetchState(id).isRefetching).toBe(false);
    expect(fallbackRenders).toBe(0);
  });

  it("does not suspend useDocuments on an update of a loaded id", async () => {
    const a = await createModel("A");
    const b = await createModel("B");
    const names: string[] = [];
    let fallbackRenders = 0;
    const view = show(
      <Boundary onFallback={() => fallbackRenders++}>
        <List ids={[a.header.id, b.header.id]} names={names} />
      </Boundary>,
    );
    await vi.waitFor(() => {
      expect(query(view.container, "name")?.textContent).toBe("A,B");
    });
    const input = query(view.container, "draft") as HTMLInputElement;
    await userEvent.click(input);
    fallbackRenders = 0;

    gated.hold();
    await rename(a.header.id, "A2");
    await gated.whenHeld(a.header.id);
    await userEvent.keyboard("x");

    expect(fallbackRenders).toBe(0);
    expect(isVisible(query(view.container, "content"))).toBe(true);
    expect(globalThis.document.activeElement).toBe(input);

    gated.open();
    await vi.waitFor(() => {
      expect(query(view.container, "name")?.textContent).toBe("A2,B");
    });
    expect(fallbackRenders).toBe(0);
    expect(input.value).toBe("x");
  });

  it("reload keeps the loaded document and reports isRefetching", async () => {
    const document = await createModel("Current");
    const id = document.header.id;
    const states: SafeState[] = [];
    show(<SafeProbe id={id} states={states} />);
    await vi.waitFor(() => {
      expect(states.at(-1)?.status).toBe("success");
    });
    const loaded = states.at(-1)!;
    expect(loaded.isRefetching).toBe(false);

    gated.hold();
    const reloaded = loaded.reload!();
    await gated.whenHeld(id);
    await vi.waitFor(() => {
      expect(states.at(-1)?.isRefetching).toBe(true);
    });
    const during = states.at(-1)!;
    expect(during.status).toBe("success");
    expect(during.data).toBe(loaded.data);
    expect(during.refetchError).toBeUndefined();

    gated.open();
    expect((await reloaded).header.id).toBe(id);
    await vi.waitFor(() => {
      expect(states.at(-1)?.isRefetching).toBe(false);
    });
    expect(states.at(-1)?.status).toBe("success");
    // Every render since the first success had data.
    const firstSuccess = states.findIndex((s) => s.status === "success");
    expect(states.slice(firstSuccess).every((s) => s.data)).toBe(true);
  });

  it("drops the document when its refetch finds it gone", async () => {
    const document = await createModel("Doomed");
    const id = document.header.id;
    const states: SafeState[] = [];
    show(<SafeProbe id={id} states={states} />);
    await vi.waitFor(() => {
      expect(states.at(-1)?.status).toBe("success");
    });

    // The real reactor's answer for a missing document.
    gated.failNext(() => module.client.get("missing-document"));
    const failed = cache.get(id, true);
    await expect(failed).rejects.toThrow();

    await vi.waitFor(() => {
      expect(states.at(-1)?.status).toBe("error");
    });
    const last = states.at(-1)!;
    expect(last.data).toBeUndefined();
    expect((last.error as Error).message).toMatch(/not found/);
    expect(last.isRefetching).toBe(false);
  });

  it("drops the document when it is deleted", async () => {
    const document = await createModel("Deleted");
    const id = document.header.id;
    const states: SafeState[] = [];
    show(<SafeProbe id={id} states={states} />);
    await vi.waitFor(() => {
      expect(states.at(-1)?.status).toBe("success");
    });

    // `addPromiseState` re-throws a failed first load; the hook reads it from state.
    const swallow = (event: PromiseRejectionEvent) => event.preventDefault();
    window.addEventListener("unhandledrejection", swallow);
    try {
      await module.client.deleteDocument(id);
      await vi.waitFor(() => {
        expect(states.at(-1)?.status).toBe("error");
      });
      expect(states.at(-1)?.data).toBeUndefined();
      await settle();
    } finally {
      window.removeEventListener("unhandledrejection", swallow);
    }
  });

  it("keeps the document and exposes the error when a refetch fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const document = await createModel("Kept");
    const id = document.header.id;
    const states: SafeState[] = [];
    const log: RenderEntry[] = [];
    let fallbackRenders = 0;
    const view = show(
      <Boundary onFallback={() => fallbackRenders++}>
        <Editor id={id} log={log} />
        <SafeProbe id={id} states={states} />
      </Boundary>,
    );
    await vi.waitFor(() => {
      expect(states.at(-1)?.status).toBe("success");
    });
    fallbackRenders = 0;

    const outage = new Error("worker unreachable");
    gated.failNext(() => Promise.reject(outage));
    await rename(id, "Unseen");
    await vi.waitFor(() => {
      expect(states.at(-1)?.refetchError).toBe(outage);
    });

    const last = states.at(-1)!;
    expect(last.status).toBe("success");
    expect(last.error).toBeUndefined();
    expect(last.isRefetching).toBe(false);
    expect(
      (last.data as DocumentModelDocument | undefined)?.state.global.name,
    ).toBe("Kept");
    expect(isVisible(query(view.container, "content"))).toBe(true);
    expect(fallbackRenders).toBe(0);
    expect(warn).toHaveBeenCalled();

    // The next successful refetch clears the error.
    await rename(id, "Recovered");
    await vi.waitFor(() => {
      expect(states.at(-1)?.refetchError).toBeUndefined();
      expect(
        (states.at(-1)?.data as DocumentModelDocument | undefined)?.state.global
          .name,
      ).toBe("Recovered");
    });
    warn.mockRestore();
  });
});
