import { useState } from "react";
import type { DesignTimeService } from "./forms.js";
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
        <span className="ml-auto text-[11px] text-slate-400">
          Use the + buttons on the canvas to add steps
        </span>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="min-h-[480px] min-w-0 flex-1">
          <WorkflowCanvas
            model={model}
            callbacks={callbacks}
            onSelect={setSelectedId}
          />
        </div>
        {selectedStep || selectedTrigger ? (
          <aside className="min-h-0 w-96 overflow-y-auto border-l border-slate-200 bg-slate-50">
            {selectedStep ? (
              <StepPanel
                key={selectedStep.id}
                step={selectedStep}
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
          </aside>
        ) : null}
      </div>
    </div>
  );
}
