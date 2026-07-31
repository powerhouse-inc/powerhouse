import type { PHDocument } from "@powerhousedao/shared/document-model";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { DocumentCache } from "../src/document-cache.js";
import { ensurePHEventHandlers } from "../src/graphql-client/graphql-reactor-provider.js";
import {
  setDocumentCache,
  useDocumentSafe,
} from "../src/hooks/document-cache.js";
import type { IReactorBrowserClient } from "../src/types/reactor-browser-client.js";

/**
 * Regression suite for the initial-resolution gap: the cache notifies
 * subscribers only when a stored promise is REPLACED (a document change),
 * never when the INITIAL fetch settles - and the hook's snapshot is the
 * promise itself, whose identity does not change on settling. Without the
 * settle watcher inside `useDocumentSafe`, a page with no other render
 * activity stays "pending" forever. (Surfaced by pfnur's statement detail
 * page, whose only state was this hook.)
 */

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const testDocument = {
  header: { id: "doc-1", name: "My Doc" },
} as unknown as PHDocument;

/** A cache over a client stub whose only job is serving the given fetch. */
function makeCache(get: (id: string) => Promise<PHDocument>) {
  const client = {
    get,
    subscribe: () => () => undefined,
  } as unknown as IReactorBrowserClient;
  return new DocumentCache(client);
}

function Probe({ id }: { id: string }) {
  const state = useDocumentSafe(id);
  return (
    <div>
      <span data-testid="status">{state.status}</span>
      <span data-testid="name">{state.data?.header.name ?? ""}</span>
      <span data-testid="error">
        {state.error instanceof Error ? state.error.message : ""}
      </span>
    </div>
  );
}

function textOf(screen: ReturnType<typeof render>, testId: string) {
  return (
    screen.container.querySelector(`[data-testid=${testId}]`)?.textContent ?? ""
  );
}

describe("useDocumentSafe", () => {
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

  it("leaves pending on its own once the initial fetch resolves", async () => {
    const { promise, resolve } = deferred<PHDocument>();
    setDocumentCache(makeCache(() => promise));

    const screen = render(
      <StrictMode>
        <Probe id="doc-1" />
      </StrictMode>,
    );
    expect(textOf(screen, "status")).toBe("pending");

    // No cache notification happens here - the settle watcher alone must
    // move the hook forward.
    resolve(testDocument);
    await vi.waitFor(() => {
      expect(textOf(screen, "status")).toBe("success");
    });
    expect(textOf(screen, "name")).toBe("My Doc");
  });

  it("reports the error once the initial fetch rejects", async () => {
    // `addPromiseState` deliberately re-throws the rejection to keep it
    // observable; swallow the resulting unhandled-rejection event so it does
    // not fail the run.
    const swallow = (event: PromiseRejectionEvent) => {
      event.preventDefault();
    };
    window.addEventListener("unhandledrejection", swallow);
    try {
      const { promise, reject } = deferred<PHDocument>();
      setDocumentCache(makeCache(() => promise));

      const screen = render(
        <StrictMode>
          <Probe id="doc-404" />
        </StrictMode>,
      );
      expect(textOf(screen, "status")).toBe("pending");

      reject(new Error("Document not found"));
      await vi.waitFor(() => {
        expect(textOf(screen, "status")).toBe("error");
      });
      expect(textOf(screen, "error")).toBe("Document not found");
    } finally {
      window.removeEventListener("unhandledrejection", swallow);
    }
  });

  it("wins the race when the promise settles before the watcher attaches", async () => {
    // An already-resolved promise: by the time the effect runs, the status is
    // no longer pending. The render-time capture still attaches `.then`, so
    // the bump fires on the next microtask instead of being skipped.
    setDocumentCache(makeCache(() => Promise.resolve(testDocument)));

    const screen = render(
      <StrictMode>
        <Probe id="doc-1" />
      </StrictMode>,
    );
    await vi.waitFor(() => {
      expect(textOf(screen, "status")).toBe("success");
    });
    expect(textOf(screen, "name")).toBe("My Doc");
  });
});
