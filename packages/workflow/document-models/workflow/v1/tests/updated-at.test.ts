import {
  addStep,
  reducer,
  setLastTest,
  setStepConfig,
  setTrigger,
  updateStep,
  utils,
  type WorkflowDocument,
} from "document-models/workflow/v1";
import { describe, expect, it } from "vitest";

const STEP = "step-aaaaaaaa";
const TRIGGER = "trigger-tttttt";

// Pins an action's timestamp, which the reducer copies into updatedAt.
function at<T extends { timestampUtcMs: string }>(action: T, time: string): T {
  return { ...action, timestampUtcMs: time };
}

function withStep(): WorkflowDocument {
  const document = reducer(
    utils.createDocument(),
    at(
      setTrigger({
        id: TRIGGER,
        pieceName: "@powerhousedao/piece-core",
        pieceVersion: "1.0.0",
        triggerName: "manual",
        config: {},
      }),
      "2026-09-28T09:00:00.000Z",
    ),
  );
  return reducer(
    document,
    at(
      addStep({
        id: STEP,
        key: "fetch",
        name: "Fetch",
        pieceName: "@acme/http",
        pieceVersion: "1.0.0",
        actionName: "http.send",
        config: { url: "https://a.dev" },
      }),
      "2026-09-28T10:00:00.000Z",
    ),
  );
}

const stepOf = (document: WorkflowDocument) =>
  document.state.global.steps.find((step) => step.id === STEP)!;

describe("updatedAt", () => {
  it("ADD_STEP and SET_TRIGGER stamp the operation's time", () => {
    const document = withStep();
    expect(stepOf(document).updatedAt).toBe("2026-09-28T10:00:00.000Z");
    expect(document.state.global.trigger?.updatedAt).toBe(
      "2026-09-28T09:00:00.000Z",
    );
  });

  it("UPDATE_STEP stamps the step", () => {
    const document = reducer(
      withStep(),
      at(updateStep({ id: STEP, name: "Fetch it" }), "2026-09-28T11:00:00Z"),
    );
    expect(stepOf(document).updatedAt).toBe("2026-09-28T11:00:00Z");
  });

  it("SET_STEP_CONFIG stamps only when the config changed", () => {
    const same = reducer(
      withStep(),
      at(
        setStepConfig({
          id: STEP,
          config: { url: "https://a.dev" },
          propertySettings: [{ prop: "url", mode: "EXPRESSION" }],
        }),
        "2026-09-28T11:00:00Z",
      ),
    );
    expect(stepOf(same).updatedAt).toBe("2026-09-28T10:00:00.000Z");
    const changed = reducer(
      same,
      at(
        setStepConfig({ id: STEP, config: { url: "https://b.dev" } }),
        "2026-09-28T12:00:00Z",
      ),
    );
    expect(stepOf(changed).updatedAt).toBe("2026-09-28T12:00:00Z");
  });

  it("SET_TRIGGER stamps the trigger on every edit", () => {
    const document = reducer(
      withStep(),
      at(
        setTrigger({
          id: TRIGGER,
          pieceName: "@powerhousedao/piece-core",
          pieceVersion: "1.0.0",
          triggerName: "manual",
          config: { note: "x" },
        }),
        "2026-09-28T13:00:00Z",
      ),
    );
    expect(document.state.global.trigger?.updatedAt).toBe(
      "2026-09-28T13:00:00Z",
    );
  });

  it("last-test ops leave it alone", () => {
    let document = withStep();
    document = reducer(
      document,
      at(
        setLastTest({
          id: TRIGGER,
          runId: "run-1",
          testedAt: "2026-09-28T16:00:00Z",
        }),
        "2026-09-28T16:00:00Z",
      ),
    );
    expect(stepOf(document).updatedAt).toBe("2026-09-28T10:00:00.000Z");
    expect(document.state.global.trigger?.updatedAt).toBe(
      "2026-09-28T09:00:00.000Z",
    );
  });
});
