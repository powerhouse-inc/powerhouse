import type { ActionEvaluations, IReactorClient } from "@powerhousedao/reactor";
import type { PHDocument } from "@powerhousedao/shared/document-model";
import type { IRenown } from "@renown/sdk";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { DocumentCache } from "../src/document-cache.js";
import { ensurePHEventHandlers } from "../src/graphql-client/graphql-reactor-provider.js";
import { setDocumentCache } from "../src/hooks/document-cache.js";
import { setReactorClientModule } from "../src/hooks/reactor.js";
import { setRenown } from "../src/hooks/renown.js";
import { useCanExecute } from "../src/hooks/use-can-execute.js";
import type { BrowserReactorClientModule } from "../src/types/global.js";
import type { IReactorBrowserClient } from "../src/types/reactor-browser-client.js";

const DOCUMENT_ID = "doc-1";

/**
 * A settled anonymous identity, so the hook stops waiting for one. `initial`
 * is the status real renown holds for a user who never logged in (or logged
 * out); a restored session is `authorized` from construction.
 */
const ANONYMOUS = {
  status: "initial",
  user: undefined,
  on: () => () => undefined,
} as unknown as IRenown;

/** The status a failed login leaves behind: anonymous and settled too. */
const LOGIN_FAILED = {
  status: "not-authorized",
  user: undefined,
  on: () => () => undefined,
} as unknown as IRenown;

function evaluations(decisions: Array<"allow" | "deny">): ActionEvaluations {
  const allowed = decisions.filter((decision) => decision === "allow").length;
  return {
    evaluations: decisions.map((decision) =>
      decision === "allow"
        ? { decision: "allow" }
        : { decision: "deny", reason: "no grant permits this operation" },
    ),
    allAllowed: allowed === decisions.length,
    anyAllowed: allowed > 0,
    allDenied: allowed === 0,
    anyDenied: allowed < decisions.length,
  };
}

/** Publishes a module whose only real member is the preflight under test. */
function setClient(evaluateActions: IReactorClient["evaluateActions"]) {
  setReactorClientModule({
    kind: "browser",
    client: { evaluateActions } as unknown as IReactorClient,
  } as unknown as BrowserReactorClientModule);
}

function documentAtRevision(revision: number): PHDocument {
  return {
    header: { id: DOCUMENT_ID, name: "doc", revision: { global: revision } },
  } as unknown as PHDocument;
}

function Probe({ candidates }: { candidates?: string[] }) {
  const state = useCanExecute(
    DOCUMENT_ID,
    (candidates ?? ["SET_NAME"]).map((type) => ({ scope: "global", type })),
  );
  return (
    <div>
      <span data-testid="status">{state.status}</span>
      <span data-testid="allAllowed">{String(state.allAllowed)}</span>
      <span data-testid="allDenied">{String(state.allDenied)}</span>
      <span data-testid="error">{state.error?.message ?? ""}</span>
      <button type="button" data-testid="refetch" onClick={state.refetch}>
        refetch
      </button>
    </div>
  );
}

function textOf(screen: ReturnType<typeof render>, testId: string) {
  return (
    screen.container.querySelector(`[data-testid=${testId}]`)?.textContent ?? ""
  );
}

describe("useCanExecute", () => {
  beforeEach(() => {
    window.ph = {};
    delete window.__phEventHandlersRegistered;
    ensurePHEventHandlers();
    setRenown(ANONYMOUS);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.ph = {};
    delete window.__phEventHandlersRegistered;
  });

  /**
   * The plain-GraphQL setup sets no reactor client module, and its light client
   * does not carry the preflight. Reporting a denial there would disable every
   * control in an app that never asked for enforcement.
   */
  it("reports unsupported when no reactor client module is set", async () => {
    const screen = render(
      <StrictMode>
        <Probe />
      </StrictMode>,
    );

    await vi.waitFor(() => {
      expect(textOf(screen, "status")).toBe("unsupported");
    });
  });

  it("reports the verdicts once they arrive", async () => {
    setClient(() => Promise.resolve(evaluations(["allow", "deny"])));

    const screen = render(
      <StrictMode>
        <Probe candidates={["SET_NAME", "DELETE_MODULE"]} />
      </StrictMode>,
    );

    await vi.waitFor(() => {
      expect(textOf(screen, "status")).toBe("ready");
    });
    expect(textOf(screen, "allAllowed")).toBe("false");
    expect(textOf(screen, "allDenied")).toBe("false");
  });

  it("reports a wholly denied set as denied and ready", async () => {
    setClient(() => Promise.resolve(evaluations(["deny"])));

    const screen = render(
      <StrictMode>
        <Probe />
      </StrictMode>,
    );

    await vi.waitFor(() => {
      expect(textOf(screen, "status")).toBe("ready");
    });
    expect(textOf(screen, "allDenied")).toBe("true");
  });

  /**
   * The named error as it arrives from the worker: the RPC boundary rebuilds it
   * from name and message, so the class identity is gone and only the name is
   * left to detect it by. It has to read as "this deployment answers none",
   * never as a denial.
   */
  it("reports unsupported when the reactor refuses for want of enforcement", async () => {
    const stripped = new Error("authEnforcement is off");
    Object.defineProperty(stripped, "name", {
      value: "AuthEnforcementDisabledError",
      configurable: true,
      writable: true,
    });
    setClient(() => Promise.reject(stripped));

    const screen = render(
      <StrictMode>
        <Probe />
      </StrictMode>,
    );

    await vi.waitFor(() => {
      expect(textOf(screen, "status")).toBe("unsupported");
    });
    expect(textOf(screen, "allDenied")).toBe("undefined");
  });

  it("reports any other failure as an error", async () => {
    setClient(() => Promise.reject(new Error("reactor unreachable")));

    const screen = render(
      <StrictMode>
        <Probe />
      </StrictMode>,
    );

    await vi.waitFor(() => {
      expect(textOf(screen, "status")).toBe("error");
    });
    expect(textOf(screen, "error")).toBe("reactor unreachable");
  });

  it("evaluates for a failed login as the settled anonymous subject", async () => {
    setRenown(LOGIN_FAILED);
    setClient(() => Promise.resolve(evaluations(["allow"])));

    const screen = render(
      <StrictMode>
        <Probe />
      </StrictMode>,
    );

    await vi.waitFor(() => {
      expect(textOf(screen, "status")).toBe("ready");
    });
  });

  /**
   * The signer's identity is pushed to the client after the first paint, so
   * evaluating before it settles predicts verdicts for the anonymous subject and
   * greys out a toolbar that is about to be allowed.
   */
  it("waits for the subject to settle before evaluating", async () => {
    setRenown(undefined);
    const evaluate = vi
      .fn()
      .mockResolvedValue(
        evaluations(["allow"]),
      ) as unknown as IReactorClient["evaluateActions"];
    setClient(evaluate);

    const screen = render(
      <StrictMode>
        <Probe />
      </StrictMode>,
    );

    await vi.waitFor(() => {
      expect(textOf(screen, "status")).toBe("loading");
    });
    expect(evaluate).not.toHaveBeenCalled();

    setRenown(ANONYMOUS);

    await vi.waitFor(() => {
      expect(textOf(screen, "status")).toBe("ready");
    });
    expect(evaluate).toHaveBeenCalled();
  });

  /**
   * A candidate list is written inline at the call site, so it is a new array on
   * every render. Keying the evaluation off its identity would re-evaluate
   * forever, which is a request per frame against the reactor.
   */
  it("does not re-evaluate for an identical candidate list", async () => {
    const evaluate = vi.fn().mockResolvedValue(evaluations(["allow"]));
    setClient(evaluate as unknown as IReactorClient["evaluateActions"]);

    const screen = render(
      <StrictMode>
        <Probe />
      </StrictMode>,
    );

    await vi.waitFor(() => {
      expect(textOf(screen, "status")).toBe("ready");
    });
    const settledCalls = evaluate.mock.calls.length;

    screen.rerender(
      <StrictMode>
        <Probe />
      </StrictMode>,
    );
    await vi.waitFor(() => {
      expect(textOf(screen, "status")).toBe("ready");
    });

    expect(evaluate.mock.calls.length).toBe(settledCalls);
  });

  it("re-evaluates when asked to refetch", async () => {
    const evaluate = vi.fn().mockResolvedValue(evaluations(["allow"]));
    setClient(evaluate as unknown as IReactorClient["evaluateActions"]);

    const screen = render(
      <StrictMode>
        <Probe />
      </StrictMode>,
    );
    await vi.waitFor(() => {
      expect(textOf(screen, "status")).toBe("ready");
    });
    const before = evaluate.mock.calls.length;

    screen.container
      .querySelector<HTMLButtonElement>("[data-testid=refetch]")
      ?.click();

    await vi.waitFor(() => {
      expect(evaluate.mock.calls.length).toBeGreaterThan(before);
    });
  });

  /**
   * A policy write lands on the document being asked about, so its revision
   * moving is the signal that a verdict may have changed.
   */
  it("re-evaluates when the document's revision moves", async () => {
    let revision = 1;
    let notify: ((event: unknown) => void) | undefined;
    const cacheClient = {
      get: () => Promise.resolve(documentAtRevision(revision)),
      subscribe: (_search: unknown, callback: (event: unknown) => void) => {
        notify = callback;
        return () => undefined;
      },
    } as unknown as IReactorBrowserClient;
    setDocumentCache(new DocumentCache(cacheClient));

    const evaluate = vi.fn().mockResolvedValue(evaluations(["allow"]));
    setClient(evaluate as unknown as IReactorClient["evaluateActions"]);

    const screen = render(
      <StrictMode>
        <Probe />
      </StrictMode>,
    );
    await vi.waitFor(() => {
      expect(textOf(screen, "status")).toBe("ready");
    });
    const before = evaluate.mock.calls.length;

    revision = 2;
    notify?.({
      type: "updated",
      documents: [documentAtRevision(revision)],
    });

    await vi.waitFor(() => {
      expect(evaluate.mock.calls.length).toBeGreaterThan(before);
    });
  });
});
