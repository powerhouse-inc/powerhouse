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
import { setDocumentCache, useDocument } from "../src/hooks/document-cache.js";
import type { IReactorBrowserClient } from "../src/types/reactor-browser-client.js";

// A real client whose `get` can be held open, standing in for the
// SharedWorker round trip. Every other member goes to the real client.
function withGatedGet(client: IReactorBrowserClient) {
  let gate: Promise<void> | undefined;
  let release: () => void = () => undefined;
  const heldIds: string[] = [];
  let onHeld: (() => void) | undefined;

  const gated = new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === "get") {
        return async (id: string) => {
          const document = await target.get(id);
          if (gate) {
            heldIds.push(id);
            onHeld?.();
            await gate;
          }
          return document;
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
    whenHeld(id: string) {
      return new Promise<void>((resolve) => {
        const check = () => {
          if (heldIds.includes(id)) resolve();
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

function Fallback({ onRender }: { onRender: () => void }) {
  onRender();
  return <div data-testid="fallback">Loading</div>;
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
    <StrictMode>
      <Suspense fallback={<Fallback onRender={onFallback} />}>
        <Editor id={id} log={log} />
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
    screen?.unmount();
    screen = undefined;
    gated.open();
    cache.dispose();
    await module.reactor.kill().completed;
    window.ph = {};
    delete window.__phEventHandlersRegistered;
  });

  async function createModel(name: string): Promise<PHDocument> {
    const document = documentModelDocumentModelModule.utils.createDocument();
    const created = await module.client.create(document);
    return module.client.execute(created.header.id, "main", [
      setModelName({ name }),
    ]);
  }

  // Bug: DocumentCache stores a pending refetch promise before notifying, so
  // a re-render during the refetch suspends and hides revealed content.
  it.fails(
    "keeps revealed content mounted while an update refetches",
    async () => {
      const document = await createModel("Before");
      const log: RenderEntry[] = [];
      let fallbackRenders = 0;
      const view = mount(
        <App
          id={document.header.id}
          log={log}
          onFallback={() => fallbackRenders++}
        />,
      );
      screen = view;

      await vi.waitFor(() => {
        expect(query(view.container, "name")?.textContent).toBe("Before");
      });
      const input = query(view.container, "draft") as HTMLInputElement;
      await userEvent.click(input);
      expect(globalThis.document.activeElement).toBe(input);
      fallbackRenders = 0;

      gated.hold();
      await module.client.execute(document.header.id, "main", [
        setModelName({ name: "After" }),
      ]);
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
    },
  );

  it("never renders the previous document once the id changes", async () => {
    const first = await createModel("First");
    const second = await createModel("Second");
    const log: RenderEntry[] = [];
    const view = mount(
      <App id={first.header.id} log={log} onFallback={() => undefined} />,
    );
    screen = view;
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
});
