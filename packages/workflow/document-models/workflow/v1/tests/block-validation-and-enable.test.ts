import {
  addStep,
  publishWorkflow,
  reducer,
  setTrigger,
  setLastTest,
  setWorkflowStatus,
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

const MANUAL = {
  pieceName: "@powerhousedao/piece-core",
  pieceVersion: "1.0.0",
  triggerName: "manual",
};

function lastOperation(document: WorkflowDocument) {
  return document.operations.global.at(-1);
}

function step(block: Partial<typeof HTTP>) {
  return addStep({
    id: "step-a",
    key: "fetch",
    name: "Fetch",
    ...HTTP,
    ...block,
    config: {},
  });
}

describe("block references", () => {
  it("ADD_STEP stores the three block fields", () => {
    const document = reducer(utils.createDocument(), step({}));
    expect(lastOperation(document)?.error).toBeUndefined();
    expect(document.state.global.steps[0]).toMatchObject(HTTP);
  });

  it.each([
    [{ pieceName: "" }, /names no piece/],
    [{ actionName: "" }, /names no action of @acme\/http/],
    [{ pieceVersion: "" }, /not an exact semver/],
    [{ pieceVersion: "^1.2.0" }, /"\^1.2.0" is not an exact semver/],
    [{ pieceVersion: "latest" }, /not an exact semver/],
  ])("ADD_STEP rejects %j", (block, message) => {
    const document = reducer(utils.createDocument(), step(block));
    expect(lastOperation(document)?.error).toMatch(message);
    expect(document.state.global.steps).toHaveLength(0);
  });

  it("UPDATE_STEP edits only the version, and rejects an inexact one", () => {
    let document = reducer(utils.createDocument(), step({}));
    document = reducer(
      document,
      updateStep({ id: "step-a", pieceVersion: "1.3.0" }),
    );
    expect(lastOperation(document)?.error).toBeUndefined();
    expect(document.state.global.steps[0]).toMatchObject({
      ...HTTP,
      pieceVersion: "1.3.0",
    });
    document = reducer(
      document,
      updateStep({ id: "step-a", pieceVersion: "1.x" }),
    );
    expect(lastOperation(document)?.error).toMatch(/not an exact semver/);
    expect(document.state.global.steps[0].pieceVersion).toBe("1.3.0");
  });

  it("UPDATE_STEP rejects clearing the piece or the action", () => {
    let document = reducer(utils.createDocument(), step({}));
    document = reducer(document, updateStep({ id: "step-a", pieceName: "" }));
    expect(lastOperation(document)?.error).toMatch(/names no piece/);
    document = reducer(document, updateStep({ id: "step-a", actionName: "" }));
    expect(lastOperation(document)?.error).toMatch(/names no action/);
    expect(document.state.global.steps[0]).toMatchObject(HTTP);
  });

  it.each([
    [{ pieceName: "" }, /names no piece/],
    [{ triggerName: "" }, /names no trigger/],
    [{ pieceVersion: "1.0" }, /not an exact semver/],
  ])("SET_TRIGGER rejects %j", (block, message) => {
    const document = reducer(
      utils.createDocument(),
      setTrigger({ id: "t", ...MANUAL, ...block, config: {} }),
    );
    expect(lastOperation(document)?.error).toMatch(message);
    expect(document.state.global.trigger).toBeNull();
  });

  it("SET_TRIGGER keeps the last test only for the same pinned trigger", () => {
    let document = reducer(
      utils.createDocument(),
      setTrigger({ id: "t", ...MANUAL, config: {} }),
    );
    document = reducer(
      document,
      setLastTest({
        id: "t",
        runId: "run-1",
        testedAt: "2026-09-28T10:00:00.000Z",
      }),
    );
    document = reducer(
      document,
      setTrigger({ id: "t", ...MANUAL, config: { a: 1 } }),
    );
    expect(document.state.global.trigger?.lastTest?.runId).toBe("run-1");
    document = reducer(
      document,
      setTrigger({ id: "t", ...MANUAL, pieceVersion: "1.1.0", config: {} }),
    );
    expect(document.state.global.trigger?.lastTest).toBeNull();
  });
});

describe("enabling", () => {
  it("refuses ENABLED before the first publish, then allows it", () => {
    let document = reducer(
      utils.createDocument(),
      setTrigger({ id: "t", ...MANUAL, config: {} }),
    );
    document = reducer(document, setWorkflowStatus({ status: "ENABLED" }));
    expect(lastOperation(document)?.error).toBe(
      "Publish the workflow before enabling it",
    );
    expect(document.state.global.status).toBe("DRAFT");

    document = reducer(
      document,
      publishWorkflow({ publishedAt: "2026-09-28T10:00:00.000Z" }),
    );
    document = reducer(document, setWorkflowStatus({ status: "ENABLED" }));
    expect(lastOperation(document)?.error).toBeUndefined();
    expect(document.state.global.status).toBe("ENABLED");
  });

  it("still allows the other statuses on an unpublished workflow", () => {
    let document = utils.createDocument();
    document = reducer(document, setWorkflowStatus({ status: "ARCHIVED" }));
    expect(lastOperation(document)?.error).toBeUndefined();
    expect(document.state.global.status).toBe("ARCHIVED");
  });
});
