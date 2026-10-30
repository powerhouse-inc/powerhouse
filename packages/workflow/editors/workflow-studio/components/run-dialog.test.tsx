// @vitest-environment happy-dom
// Run on a manual trigger with inputs asks for them, against a real GraphQL socket.
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { graphqlServer } from "../../../test/graphql-server.js";
import {
  RuntimeProvider,
  useRuntimeActions,
} from "../../workflow-editor/runtime-context.js";
import { parseManualInputs } from "../../workflow-editor/ui/manual-inputs.js";
import { RunsView } from "./RunsView.js";

const fires: unknown[] = [];
let fireError: string | null = null;
const graphql = graphqlServer(({ query, variables }) => {
  if (!query.includes("fire(")) return {};
  fires.push(variables.payload);
  return {
    workflowRuntime: {
      fire: fireError
        ? { runId: null, status: "FAILED", error: fireError }
        : { runId: "run-1", status: "SUCCEEDED", error: null },
    },
  };
});

afterEach(() => {
  cleanup();
  fires.length = 0;
  fireError = null;
});

const INPUTS = parseManualInputs({
  inputs: [
    { displayName: "Email", name: "email", type: "text", required: true },
    {
      displayName: "Amount",
      name: "amount",
      type: "number",
      defaultValue: "5",
    },
    { displayName: "Urgent", name: "urgent", type: "toggle" },
    {
      displayName: "Tier",
      name: "tier",
      type: "dropdown",
      options: "gold\nsilver",
      defaultValue: "silver",
    },
    {
      displayName: "Region",
      name: "region",
      type: "dropdown",
      options: "Europe = eu\nUnited States = us",
      defaultValue: "eu",
    },
  ],
});

function Runs() {
  const { fireWorkflow } = useRuntimeActions();
  return (
    <RunsView
      title="Runs"
      runs={[]}
      error={null}
      reload={() => {}}
      showWorkflow={false}
      onFire={(payload) =>
        fireWorkflow("wf-1", payload).then((result) => result.error)
      }
      fireInputs={INPUTS}
    />
  );
}

function openDialog() {
  render(
    <RuntimeProvider url={graphql.url} store={null}>
      <Runs />
    </RuntimeProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /run now/i }));
  return screen.getByRole("dialog", { name: "Run workflow" });
}

function type(field: HTMLElement, value: string) {
  fireEvent.focus(field);
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
}

describe("the run dialog", () => {
  it("fires with the typed payload and closes", async () => {
    const dialog = openDialog();
    type(within(dialog).getByLabelText(/^Email/), "a@b.c");
    type(within(dialog).getByLabelText(/^Amount/), "1250");
    fireEvent.click(within(dialog).getByRole("switch", { name: "Urgent" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Run" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Run workflow" })).toBeNull(),
    );
    expect(fires).toEqual([
      {
        email: "a@b.c",
        amount: 1250,
        urgent: true,
        tier: "silver",
        region: "eu",
      },
    ]);
  });

  it("shows a dropdown's labels and sends the chosen value", async () => {
    const dialog = openDialog();
    type(within(dialog).getByLabelText(/^Email/), "a@b.c");
    expect(
      within(dialog)
        .getByRole("radio", { name: "Europe" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    fireEvent.click(
      within(dialog).getByRole("radio", { name: "United States" }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Run" }));
    await waitFor(() =>
      expect(fires).toEqual([
        expect.objectContaining({ email: "a@b.c", region: "us" }),
      ]),
    );
  });

  it("blocks the submit while a required field is empty", async () => {
    const dialog = openDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: "Run" }));
    expect(within(dialog).getByRole("alert").textContent).toBe(
      "Email is required",
    );
    // Nothing reached the runtime.
    await new Promise((settle) => setTimeout(settle, 50));
    expect(fires).toEqual([]);
  });

  it("shows the runtime's refusal inline and stays open", async () => {
    fireError = 'Manual trigger payload: "email" is required';
    const dialog = openDialog();
    type(within(dialog).getByLabelText(/^Email/), "a@b.c");
    fireEvent.click(within(dialog).getByRole("button", { name: "Run" }));
    await waitFor(() =>
      expect(within(dialog).getByRole("alert").textContent).toBe(fireError),
    );
    expect(screen.getByRole("dialog", { name: "Run workflow" })).toBeTruthy();
  });

  it("sends a raw JSON payload as written", async () => {
    const dialog = openDialog();
    fireEvent.click(within(dialog).getByRole("switch", { name: "Raw JSON" }));
    const raw = within(dialog).getByLabelText("Payload");
    fireEvent.change(raw, { target: { value: '{"anything": [1, 2]}' } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Run" }));
    await waitFor(() => expect(fires).toEqual([{ anything: [1, 2] }]));
  });
});
