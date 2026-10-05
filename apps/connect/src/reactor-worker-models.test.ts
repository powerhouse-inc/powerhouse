import { describe, expect, it, vi } from "vitest";
import { loadFlaggedDocumentModels } from "./reactor-worker-models.js";

// Shape the worker's filter keeps: a document-model module, not a type or a
// helper the barrel also re-exports.
function fakeModel(id: string) {
  return { documentModel: { global: { id } }, reducer: () => undefined };
}

function loaders() {
  return {
    vetra: vi.fn(() =>
      Promise.resolve({ Vetra: fakeModel("powerhouse/vetra"), notAModel: 1 }),
    ),
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
  it("loads nothing — and imports neither chunk — with both flags off", async () => {
    const load = loaders();
    expect(await loadFlaggedDocumentModels({}, load)).toEqual([]);
    expect(load.vetra).not.toHaveBeenCalled();
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
    // Workflows do not drag vetra in.
    expect(load.vetra).not.toHaveBeenCalled();
  });

  it("keeps studio mode from implying workflows", async () => {
    const load = loaders();
    const models = await loadFlaggedDocumentModels({ studioMode: true }, load);
    expect(ids(models)).toEqual(["powerhouse/vetra"]);
    expect(load.workflow).not.toHaveBeenCalled();
  });

  it("loads both when both flags are on", async () => {
    const load = loaders();
    const models = await loadFlaggedDocumentModels(
      { studioMode: true, workflowsEnabled: true },
      load,
    );
    expect(ids(models)).toEqual([
      "powerhouse/vetra",
      "powerhouse/workflow",
      "powerhouse/connection",
    ]);
  });
});
