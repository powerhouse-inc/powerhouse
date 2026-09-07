import { useMemo, useState } from "react";
import {
  ExpressionPickerPopup,
  ExpressionTargetProvider,
} from "./ExpressionPicker.js";
import type { DesignTimeService } from "./forms.js";
import type {
  WorkflowEditorCallbacks,
  WorkflowModel,
  WorkflowStatusValue,
} from "./model.js";
import { StepPanel, TriggerPanel } from "./StepPanel.js";
import { VariablesEditor } from "./VariablesEditor.js";
import { WorkflowCanvas } from "./WorkflowCanvas.js";

const VARIABLES_VIEW = "__variables";

const STATUSES: WorkflowStatusValue[] = [
  "DRAFT",
  "ENABLED",
  "DISABLED",
  "ARCHIVED",
];

export function WorkflowEditorApp(props: {
  model: WorkflowModel;
  callbacks: WorkflowEditorCallbacks;
  designTime?: DesignTimeService;
}) {
  const { model, callbacks } = props;
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedStep = model.steps.find((step) => step.id === selectedId);
  const selectedTrigger =
    model.trigger && model.trigger.id === selectedId ? model.trigger : null;
  const showVariables = selectedId === VARIABLES_VIEW;
  const stepBlockTypes = useMemo(
    () =>
      Object.fromEntries(model.steps.map((step) => [step.key, step.blockType])),
    [model.steps],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-2">
        <input
          key={model.name}
          className="min-w-0 max-w-72 rounded border border-transparent px-1 py-0.5 text-sm font-semibold text-slate-800 hover:border-slate-200 focus:border-slate-300 focus:outline-none"
          defaultValue={model.name}
          placeholder="Untitled workflow"
          spellCheck={false}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          onBlur={(event) => {
            const name = event.target.value.trim();
            if (name && name !== model.name) callbacks.setName(name);
          }}
        />
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
        <span className="ml-auto text-[11px] text-slate-400">
          Use the + buttons on the canvas to add steps
        </span>
        <button
          type="button"
          className={`rounded border px-2 py-0.5 text-[11px] font-medium ${
            showVariables
              ? "border-slate-800 bg-slate-800 text-white"
              : "border-slate-200 text-slate-500 hover:bg-slate-100"
          }`}
          onClick={() => setSelectedId(showVariables ? null : VARIABLES_VIEW)}
        >
          Variables
          {model.variables.length > 0 ? ` (${model.variables.length})` : ""}
        </button>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="min-h-[480px] min-w-0 flex-1">
          <WorkflowCanvas
            model={model}
            callbacks={callbacks}
            onSelect={setSelectedId}
            designTime={props.designTime}
          />
        </div>
        {showVariables ? (
          <aside className="min-h-0 w-96 overflow-y-auto border-l border-slate-200 bg-slate-50">
            <VariablesEditor
              variables={model.variables}
              callbacks={callbacks}
              onClose={() => setSelectedId(null)}
            />
          </aside>
        ) : null}
        {selectedStep || selectedTrigger ? (
          <ExpressionTargetProvider
            key={selectedId}
            stepBlockTypes={stepBlockTypes}
            triggerBlockType={model.trigger?.blockType}
          >
            <aside className="flex min-h-0 w-96 flex-col border-l border-slate-200 bg-slate-50">
              <div className="min-h-0 flex-1 overflow-y-auto">
                {selectedStep ? (
                  <StepPanel
                    key={selectedStep.id}
                    step={selectedStep}
                    model={model}
                    callbacks={callbacks}
                    onClose={() => setSelectedId(null)}
                    designTime={props.designTime}
                  />
                ) : null}
                {selectedTrigger ? (
                  <TriggerPanel
                    key={selectedTrigger.id}
                    trigger={selectedTrigger}
                    callbacks={callbacks}
                    onClose={() => setSelectedId(null)}
                    designTime={props.designTime}
                  />
                ) : null}
              </div>
              <ExpressionPickerPopup />
            </aside>
          </ExpressionTargetProvider>
        ) : null}
      </div>
    </div>
  );
}
