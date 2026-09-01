import { useState } from "react";
import { STEP_PRESETS, TRIGGER_PRESETS } from "./blocks.js";
import type {
  WorkflowEditorCallbacks,
  WorkflowModel,
  WorkflowStatusValue,
} from "./model.js";
import { StepPanel, TriggerPanel } from "./StepPanel.js";
import { WorkflowCanvas } from "./WorkflowCanvas.js";

const STATUSES: WorkflowStatusValue[] = [
  "DRAFT",
  "ENABLED",
  "DISABLED",
  "ARCHIVED",
];

function AddMenu(props: {
  label: string;
  options: { label: string; onPick(): void }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        className="rounded bg-slate-800 px-3 py-1.5 text-xs font-medium text-white"
        onClick={() => setOpen((value) => !value)}
      >
        {props.label}
      </button>
      {open ? (
        <div className="absolute right-0 z-50 mt-1 w-56 rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          {props.options.map((option) => (
            <button
              key={option.label}
              type="button"
              className="block w-full px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100"
              onClick={() => {
                option.onPick();
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function WorkflowEditorApp(props: {
  model: WorkflowModel;
  callbacks: WorkflowEditorCallbacks;
}) {
  const { model, callbacks } = props;
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedStep = model.steps.find((step) => step.id === selectedId);
  const selectedTrigger =
    model.trigger && model.trigger.id === selectedId ? model.trigger : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-2">
        <span className="text-sm font-semibold text-slate-800">
          {model.name || "Untitled workflow"}
        </span>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
          v{model.version}
        </span>
        <select
          className="rounded border border-slate-300 px-2 py-1 text-xs"
          value={model.status}
          onChange={(event) =>
            callbacks.setStatus(event.target.value as WorkflowStatusValue)
          }
        >
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-2">
          {!model.trigger ? (
            <AddMenu
              label="Set trigger"
              options={TRIGGER_PRESETS.map((preset) => ({
                label: preset.label,
                onPick: () =>
                  callbacks.setTrigger({
                    blockType: preset.blockType,
                    config: preset.defaultConfig,
                  }),
              }))}
            />
          ) : null}
          <AddMenu
            label="Add step"
            options={STEP_PRESETS.map((preset) => ({
              label: preset.label,
              onPick: () =>
                callbacks.addStep({
                  key: `step_${model.steps.length + 1}`,
                  name: preset.label,
                  blockType: preset.blockType,
                  config: preset.defaultConfig,
                  position: {
                    x: 80 + model.steps.length * 40,
                    y: 160 + model.steps.length * 60,
                  },
                }),
            }))}
          />
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="h-[640px] min-w-0 flex-1">
          <WorkflowCanvas
            model={model}
            callbacks={callbacks}
            onSelect={setSelectedId}
          />
        </div>
        {selectedStep || selectedTrigger ? (
          <aside className="h-[640px] w-96 overflow-y-auto border-l border-slate-200 bg-slate-50">
            {selectedStep ? (
              <StepPanel
                key={selectedStep.id}
                step={selectedStep}
                callbacks={callbacks}
                onClose={() => setSelectedId(null)}
              />
            ) : null}
            {selectedTrigger ? (
              <TriggerPanel
                key={selectedTrigger.id}
                trigger={selectedTrigger}
                callbacks={callbacks}
                onClose={() => setSelectedId(null)}
              />
            ) : null}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
