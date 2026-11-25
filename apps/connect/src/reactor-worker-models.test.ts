import { describe, expect, it, vi } from "vitest";
import { loadFlaggedDocumentModels } from "./reactor-worker-models.js";

// Shape the worker's filter keeps: a document-model module, not a type or a
// helper the barrel also re-exports.
function fakeModel(id: string) {
  return { documentModel: { global: { id } }, reducer: () => undefined };
}

function loaders() {
  return {
    workflow: vi.fn(() =>
      Promise.resolve({
        Workflow: fakeModel("powerhouse/workflow"),
        Connection: fakeModel("powerhouse/connection"),
        WorkflowStateSchema: () => undefined,
      }),
    ),
  };
}

const ids = (models: { documentModel: { global: { id: string } } }[]) =>
  models.map((m) => m.documentModel.global.id);

describe("loadFlaggedDocumentModels", () => {
  it("loads nothing, and imports no chunk, with the flag off", async () => {
    const load = loaders();
    expect(await loadFlaggedDocumentModels({}, load)).toEqual([]);
    expect(load.workflow).not.toHaveBeenCalled();
  });

  it("loads the workflow document models only when workflowsEnabled is on", async () => {
    const load = loaders();
    const models = await loadFlaggedDocumentModels(
      { workflowsEnabled: true },
      load,
    );
    expect(ids(models)).toEqual([
      "powerhouse/workflow",
      "powerhouse/connection",
    ]);
    // The barrel's non-model export is filtered out.
    expect(models).toHaveLength(2);
    expect(load.workflow).toHaveBeenCalledTimes(1);
  });
});
