// Block config is always an object, and variables are upserted by id with a
// unique key: every writer reads the same document the same way.
import {
  addStep,
  reducer,
  setStepConfig,
  setTrigger,
  setVariable,
  updateStep,
  utils,
  type WorkflowDocument,
} from "document-models/workflow/v1";
import { describe, expect, it } from "vitest";

const HTTP = {
  pieceName: "@acme/http",
  pieceVersion: "1.2.0",
  actionName: "send_request",
};

function lastError(document: WorkflowDocument) {
  return document.operations.global.at(-1)?.error;
}

function withStep(): WorkflowDocument {
  return reducer(
    utils.createDocument(),
    addStep({
      id: "s",
      key: "fetch",
      name: "Fetch",
      ...HTTP,
      config: {},
    }),
  );
}

describe("config must be an object", () => {
  it.each([
    ["a JSON string", '{"url":"x"}'],
    ["an array", ["x"]],
    ["null", null],
    ["a number", 5],
  ])("ADD_STEP refuses %s", (_label, config) => {
    const document = reducer(
      utils.createDocument(),
      addStep({ id: "s", key: "k", name: "K", ...HTTP, config }),
    );
    expect(lastError(document)).toBe("A step config must be an object");
    expect(document.state.global.steps).toHaveLength(0);
  });

  it("SET_STEP_CONFIG and UPDATE_STEP refuse a string and keep the old config", () => {
    let document = withStep();
    document = reducer(
      document,
      setStepConfig({ id: "s", config: '{"url":"x"}' }),
    );
    expect(lastError(document)).toBe("A step config must be an object");
    document = reducer(document, updateStep({ id: "s", config: "text" }));
    expect(lastError(document)).toBe("A step config must be an object");
    expect(document.state.global.steps[0].config).toEqual({});
    document = reducer(
      document,
      setStepConfig({ id: "s", config: { url: "x" } }),
    );
    expect(lastError(document)).toBeUndefined();
  });

  it("SET_TRIGGER refuses a string config", () => {
    const document = reducer(
      utils.createDocument(),
      setTrigger({
        id: "t",
        pieceName: "@powerhousedao/piece-core",
        pieceVersion: "1.0.0",
        triggerName: "schedule",
        config: '{"mode":"cron","cron":"0 9 * * *"}',
      }),
    );
    expect(lastError(document)).toBe("The trigger config must be an object");
    expect(document.state.global.trigger).toBeNull();
  });
});

describe("variables", () => {
  it("are upserted by id, so a rename keeps the variable", () => {
    let document = reducer(
      utils.createDocument(),
      setVariable({ id: "v1", key: "channel", value: "#ops" }),
    );
    document = reducer(
      document,
      setVariable({ id: "v1", key: "room", value: "#ops" }),
    );
    expect(document.state.global.variables).toEqual([
      expect.objectContaining({ id: "v1", key: "room", value: "#ops" }),
    ]);
  });

  it("refuse a key another variable holds", () => {
    let document = reducer(
      utils.createDocument(),
      setVariable({ id: "v1", key: "channel", value: "#ops" }),
    );
    document = reducer(
      document,
      setVariable({ id: "v2", key: "channel", value: "#dev" }),
    );
    expect(lastError(document)).toBe(
      'Another variable already uses the key "channel"',
    );
    expect(document.state.global.variables).toHaveLength(1);
    expect(document.state.global.variables[0].value).toBe("#ops");
  });
});
