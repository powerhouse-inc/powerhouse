// @vitest-environment happy-dom
import {
  createPHStore,
  createSwitchboardDirectory,
  PHStoreProvider,
  type SwitchboardDirectory,
} from "@powerhousedao/reactor-browser";
import {
  cleanup,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { useRuntime, WorkflowRuntimeProvider } from "./runtime-context.js";
import { useWorkflowRuntime } from "./use-workflow-runtime.js";

afterEach(() => {
  cleanup();
});

// The app's store, provided to the tree: what Connect hands its editors.
function providing(switchboards: SwitchboardDirectory | undefined) {
  const store = createPHStore(switchboards ? { switchboards } : {});
  return ({ children }: { children: ReactNode }) =>
    createElement(PHStoreProvider, { store, children });
}

const oneSwitchboard = () =>
  createSwitchboardDirectory({
    remoteBackends: [{ name: "sb", url: "http://localhost:2540/d/sektar" }],
  });

describe("useWorkflowRuntime", () => {
  it("resolves the only switchboard's runtime from the provided store", async () => {
    const { result } = renderHook(() => useWorkflowRuntime(), {
      wrapper: providing(oneSwitchboard()),
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current).toMatchObject({
      url: "http://localhost:2540/graphql/workflow-runtime",
      switchboard: { name: "sb" },
    });
  });

  it("says why when the app reaches no switchboard", async () => {
    const { result } = renderHook(() => useWorkflowRuntime(), {
      wrapper: providing(createSwitchboardDirectory({})),
    });
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(
      result.current.status === "unavailable" && result.current.error.message,
    ).toBe("This app reaches no switchboard; it is connected to none.");
  });

  it("says why when the host provides no directory", async () => {
    const { result } = renderHook(() => useWorkflowRuntime(), {
      wrapper: providing(undefined),
    });
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
  });
});

describe("WorkflowRuntimeProvider", () => {
  function RuntimeUrl() {
    return <span>{useRuntime().client.url}</span>;
  }

  it("gives its children a client for the resolved runtime", async () => {
    const Wrapper = providing(oneSwitchboard());
    render(
      <Wrapper>
        <WorkflowRuntimeProvider>
          <RuntimeUrl />
        </WorkflowRuntimeProvider>
      </Wrapper>,
    );
    expect(
      await screen.findByText("http://localhost:2540/graphql/workflow-runtime"),
    ).toBeTruthy();
  });

  it("shows the reason instead of its children when no runtime can be picked", async () => {
    const Wrapper = providing(
      createSwitchboardDirectory({
        remoteBackends: [
          { name: "laptop", url: "http://localhost:2540/d/sektar" },
          { name: "cloud", url: "https://cloud.example.com/d/sektar" },
        ],
      }),
    );
    render(
      <Wrapper>
        <WorkflowRuntimeProvider>
          <RuntimeUrl />
        </WorkflowRuntimeProvider>
      </Wrapper>,
    );
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(
      /^The workflow runtime is unavailable: This app reaches several switchboards \(laptop/,
    );
    expect(screen.queryByText(/workflow-runtime$/)).toBeNull();
  });
});
