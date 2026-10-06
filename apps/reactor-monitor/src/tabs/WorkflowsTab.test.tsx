// @vitest-environment happy-dom
import type { ManagedReactor } from "@powerhousedao/reactor-monitor";
import type {
  RunPage,
  RunRecord,
  RuntimeClient,
  RuntimeClientOptions,
} from "@powerhousedao/workflow/editors/runtime";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkflowsTab, type CreateRuntimeClient } from "./WorkflowsTab.js";

/**
 * The Workflows tab reuses Workflow Studio's standalone runtime client against
 * the reactor's workflow-runtime subgraph (multi-reactor §3). These inject a
 * stub `createClient`, so the tab is driven off a mocked runtime and the
 * derived URL and auth are asserted at the seam, with no network.
 */

function run(id: string, overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id,
    workflowId: "wf-1",
    workflowName: "Nightly close",
    workflowVersion: 1,
    triggerKind: "schedule",
    triggerPayload: null,
    status: "SUCCEEDED",
    error: null,
    errorName: null,
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T00:00:05.000Z",
    rerunOf: null,
    warningNotes: [],
    steps: [],
    ...overrides,
  };
}

function page(items: RunRecord[], cursor: string | null): RunPage {
  return { items, hasNextPage: cursor !== null, cursor };
}

function remoteReactor(
  overrides: Partial<{ workflows: boolean; url: string }> = {},
): ManagedReactor {
  return {
    name: "sb",
    kind: "remote",
    url: overrides.url ?? "http://host.example/graphql",
    serverInfo: { workflows: overrides.workflows ?? true },
  } as unknown as ManagedReactor;
}

type Stub = {
  readonly client: RuntimeClient;
  readonly fetchRunsPage: ReturnType<typeof vi.fn>;
  readonly fetchRun: ReturnType<typeof vi.fn>;
  readonly createClient: CreateRuntimeClient;
};

function stubRuntime(pages: RunPage[], detail?: RunRecord | null): Stub {
  let call = 0;
  const fetchRunsPage = vi.fn(() => {
    const result = pages[Math.min(call, pages.length - 1)];
    call += 1;
    return Promise.resolve(result);
  });
  const fetchRun = vi.fn(() => Promise.resolve(detail ?? null));
  const client = { fetchRunsPage, fetchRun } as unknown as RuntimeClient;
  const createClient = vi.fn(
    (_url: string, _options: RuntimeClientOptions) => client,
  ) as unknown as CreateRuntimeClient;
  return { client, fetchRunsPage, fetchRun, createClient };
}

describe("WorkflowsTab gating", () => {
  it("shows the unavailable panel for a local reactor", () => {
    const { createClient } = stubRuntime([]);
    const view = render(
      <WorkflowsTab
        createClient={createClient}
        reactor={
          { name: "local", kind: "in-process" } as unknown as ManagedReactor
        }
      />,
    );

    expect(view.getByTestId("workflows-unavailable").textContent).toContain(
      "Node host",
    );
    expect(createClient).not.toHaveBeenCalled();
  });

  it("shows the unavailable panel when the host reports no workflow runtime", () => {
    const { createClient } = stubRuntime([]);
    const view = render(
      <WorkflowsTab
        createClient={createClient}
        reactor={remoteReactor({ workflows: false })}
      />,
    );

    expect(view.getByTestId("workflows-unavailable").textContent).toContain(
      "no workflow runtime",
    );
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("WorkflowsTab runs", () => {
  it("derives the workflow-runtime URL and authenticates without the ambient token", async () => {
    const { createClient } = stubRuntime([page([run("r1")], null)]);
    render(
      <WorkflowsTab createClient={createClient} reactor={remoteReactor()} />,
    );

    const mocked = vi.mocked(createClient);
    await waitFor(() => expect(mocked).toHaveBeenCalled());
    const [url, options] = mocked.mock.calls[0] as [
      string,
      RuntimeClientOptions,
    ];
    expect(url).toBe("http://host.example/graphql/workflow-runtime");
    expect(options.fetch).toBeTypeOf("function");
    expect(await options.token!()).toBeNull();
  });

  it("renders the runs the runtime answers with", async () => {
    const { createClient } = stubRuntime([
      page([run("r2"), run("r1", { status: "FAILED" })], null),
    ]);
    const view = render(
      <WorkflowsTab createClient={createClient} reactor={remoteReactor()} />,
    );

    await waitFor(() => {
      expect(view.getAllByTestId("workflows-run-row")).toHaveLength(2);
    });
    expect(view.getByTestId("workflows-counts").textContent).toContain(
      "Runs: 2",
    );
  });

  it("pages via the cursor when Load more is clicked", async () => {
    const { createClient, fetchRunsPage } = stubRuntime([
      page([run("r3"), run("r2")], "c1"),
      page([run("r1")], null),
    ]);
    const view = render(
      <WorkflowsTab createClient={createClient} reactor={remoteReactor()} />,
    );

    await waitFor(() => {
      expect(view.getAllByTestId("workflows-run-row")).toHaveLength(2);
    });

    fireEvent.click(view.getByTestId("workflows-load-more"));

    await waitFor(() => {
      expect(view.getAllByTestId("workflows-run-row")).toHaveLength(3);
    });
    // Second page fetched on the first page's cursor.
    expect(fetchRunsPage.mock.calls[1]?.[1]).toBe("c1");
  });

  it("expands a run into its per-step detail via fetchRun", async () => {
    const detail = run("r1", {
      steps: [
        {
          stepId: "s1",
          stepKey: "fetch",
          pieceName: "@acme/piece-x",
          blockName: "Fetch invoices",
          status: "SUCCEEDED",
          input: null,
          output: null,
          port: null,
          error: null,
          errorName: null,
          startedAt: "2026-01-01T00:00:01.000Z",
          endedAt: "2026-01-01T00:00:02.000Z",
        },
      ],
    });
    const { createClient, fetchRun } = stubRuntime(
      [page([run("r1")], null)],
      detail,
    );
    const view = render(
      <WorkflowsTab createClient={createClient} reactor={remoteReactor()} />,
    );

    await waitFor(() => {
      expect(view.getAllByTestId("workflows-run-row")).toHaveLength(1);
    });
    fireEvent.click(view.getByTestId("workflows-run-row"));

    await waitFor(() => {
      expect(view.getByTestId("workflows-run-detail").textContent).toContain(
        "Fetch invoices",
      );
    });
    expect(fetchRun).toHaveBeenCalledWith("r1");
  });

  it("surfaces a read failure instead of a silent blank", async () => {
    const createClient = vi.fn(
      () =>
        ({
          fetchRunsPage: () => Promise.reject(new Error("runtime down")),
          fetchRun: () => Promise.resolve(null),
        }) as unknown as RuntimeClient,
    ) as unknown as CreateRuntimeClient;
    const view = render(
      <WorkflowsTab createClient={createClient} reactor={remoteReactor()} />,
    );

    await waitFor(() => {
      expect(view.container.textContent).toContain("runtime down");
    });
  });
});
