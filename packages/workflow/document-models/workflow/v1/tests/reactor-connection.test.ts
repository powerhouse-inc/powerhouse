import {
  addStep,
  publishWorkflow,
  reducer,
  revertToPublished,
  setTrigger,
  updateStep,
  utils,
  type WorkflowDocument,
} from "document-models/workflow/v1";
import { describe, expect, it } from "vitest";

const TRIGGER = "trigger-tttttt";
const STEP = "step-aaaaaaaa";

function withStep(reactorConnectionId?: string | null): WorkflowDocument {
  return reducer(
    utils.createDocument(),
    addStep({
      id: STEP,
      key: "archive",
      name: "Archive",
      pieceName: "@acme/piece-invoices",
      pieceVersion: "1.0.0",
      actionName: "archive_invoice",
      connectionId: "phd:connection-1",
      reactorConnectionId,
      config: {},
    }),
  );
}

describe("reactorConnectionId", () => {
  it("is stored on an added step, and null when absent", () => {
    expect(withStep("phd:reactor-1").state.global.steps[0]).toMatchObject({
      connectionId: "phd:connection-1",
      reactorConnectionId: "phd:reactor-1",
    });
    expect(withStep().state.global.steps[0].reactorConnectionId).toBeNull();
  });

  it("is left by an update that omits it, and cleared by null", () => {
    let document = withStep("phd:reactor-1");
    document = reducer(document, updateStep({ id: STEP, name: "Renamed" }));
    expect(document.state.global.steps[0].reactorConnectionId).toBe(
      "phd:reactor-1",
    );
    document = reducer(
      document,
      updateStep({ id: STEP, reactorConnectionId: "phd:reactor-2" }),
    );
    expect(document.state.global.steps[0].reactorConnectionId).toBe(
      "phd:reactor-2",
    );
    document = reducer(
      document,
      updateStep({ id: STEP, reactorConnectionId: null }),
    );
    expect(document.state.global.steps[0]).toMatchObject({
      connectionId: "phd:connection-1",
      reactorConnectionId: null,
    });
  });

  it("is set and replaced on the trigger", () => {
    const trigger = {
      id: TRIGGER,
      pieceName: "@acme/piece-invoices",
      pieceVersion: "1.0.0",
      triggerName: "invoice_created",
      config: {},
    };
    let document = reducer(
      utils.createDocument(),
      setTrigger({ ...trigger, reactorConnectionId: "phd:reactor-1" }),
    );
    expect(document.state.global.trigger?.reactorConnectionId).toBe(
      "phd:reactor-1",
    );
    document = reducer(document, setTrigger(trigger));
    expect(document.state.global.trigger?.reactorConnectionId).toBeNull();
  });

  it("travels with the published snapshot and back on revert", () => {
    let document = withStep("phd:reactor-1");
    document = reducer(
      document,
      publishWorkflow({ publishedAt: "2026-10-02T10:00:00.000Z" }),
    );
    expect(document.state.global.published?.steps[0].reactorConnectionId).toBe(
      "phd:reactor-1",
    );
    document = reducer(
      document,
      updateStep({ id: STEP, reactorConnectionId: null }),
    );
    expect(document.state.global.published?.steps[0].reactorConnectionId).toBe(
      "phd:reactor-1",
    );
    document = reducer(document, revertToPublished({}));
    expect(document.state.global.steps[0].reactorConnectionId).toBe(
      "phd:reactor-1",
    );
  });
});
