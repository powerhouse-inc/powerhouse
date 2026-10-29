// @vitest-environment happy-dom
// The run detail's waits and the cancel button, against a real GraphQL socket.
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { graphqlServer } from "../../../test/graphql-server.js";
import { waitpointRecord } from "../../../test/waitpoint-record.js";
import type {
  RunRecord,
  WaitpointRecord,
} from "../../workflow-editor/runtime-client.js";
import { RuntimeProvider } from "../../workflow-editor/runtime-context.js";
import { CancelRunButton, RunWaitpoints } from "./Waitpoints.js";

// The switchboard answers a cancelled run with its reason in error.
const graphql = graphqlServer(({ query }) =>
  query.includes("cancelRun")
    ? {
        workflowRuntime: {
          cancelRun: {
            runId: "run-1",
            status: "CANCELLED",
            error: "Cancelled by did:key:z6Mk",
          },
        },
      }
    : {},
);

afterEach(() => {
  cleanup();
  graphql.requests.length = 0;
});

const waitpoint = (overrides: Partial<WaitpointRecord>) =>
  waitpointRecord({
    approval: {
      title: "Pay the invoice?",
      body: null,
      approveLabel: "Approve",
      rejectLabel: "Disapprove",
      reasonRequiredOn: "none",
      approvers: [],
    },
    ...overrides,
  });

function inRuntime(children: React.ReactNode) {
  return render(
    <RuntimeProvider url={graphql.url} store={null}>
      {children}
    </RuntimeProvider>,
  );
}

describe("RunWaitpoints", () => {
  it("offers a decision on approvals only, and names callback waits", () => {
    inRuntime(
      <RunWaitpoints
        waitpoints={[
          waitpoint({ id: "a", stepKey: "ask" }),
          waitpoint({
            id: "b",
            stepKey: "hook",
            blockName: "wait_for_webhook",
            kind: "webhook",
            approval: null,
          }),
        ]}
        names={new Map([["hook", "Wait for payment"]])}
        onChanged={() => {}}
      />,
    );
    expect(screen.getAllByRole("button", { name: /approve/i })).toHaveLength(2);
    expect(screen.getAllByRole("region")).toHaveLength(1);
    expect(screen.getByText("Pay the invoice?")).toBeTruthy();
    expect(
      screen.getByText("Wait for payment is waiting for a webhook callback"),
    ).toBeTruthy();
  });
});

describe("CancelRunButton", () => {
  it("shows no error when the run comes back cancelled with its reason", async () => {
    const onChanged = vi.fn();
    inRuntime(
      <CancelRunButton
        run={{ id: "run-1", status: "WAITING" } as RunRecord}
        onChanged={onChanged}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /cancel run/i }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(
      graphql.requests.some(({ query }) => query.includes("cancelRun")),
    ).toBe(true);
    expect(screen.queryByText(/Cancelled by/)).toBeNull();
  });
});
