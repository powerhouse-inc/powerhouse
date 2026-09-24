import { useMemo, useState } from "react";
import { Button, Select } from "../../shared/controls.js";
import { Icon } from "../../shared/icons.js";
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

const STATUS_HINT: Record<WorkflowStatusValue, string> = {
  DRAFT: "Saved, never runs",
  ENABLED: "Runs when its trigger fires",
  DISABLED: "Paused, keeps its history",
  ARCHIVED: "Retired",
};

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
      <div className="flex items-center gap-3 border-b border-solid border-foreground/10 bg-background px-4 py-2">
        <input
          key={model.name}
          aria-label="Workflow name"
          className="min-w-0 max-w-72 rounded-md border border-solid border-transparent bg-transparent px-1.5 py-1 text-[15px] font-semibold text-foreground hover:border-foreground/15 focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/25"
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
        <span className="text-xs tabular-nums text-muted-foreground">
          v{model.version}
        </span>
        <div className="w-36">
          <Select
            value={model.status}
            options={STATUSES.map((status) => ({
              value: status,
              label: status.charAt(0) + status.slice(1).toLowerCase(),
              description: STATUS_HINT[status],
            }))}
            onChange={(status) =>
              callbacks.setStatus(status as WorkflowStatusValue)
            }
          />
        </div>
        <span className="ml-auto hidden text-xs text-muted-foreground lg:inline">
          Add steps with the + buttons on the canvas
        </span>
        <Button
          size="sm"
          variant={showVariables ? "primary" : "secondary"}
          aria-pressed={showVariables}
          onClick={() => setSelectedId(showVariables ? null : VARIABLES_VIEW)}
        >
          <Icon name="braces" className="h-3.5 w-3.5" />
          Variables
          {model.variables.length > 0 ? (
            <span className="tabular-nums opacity-70">
              {model.variables.length}
            </span>
          ) : null}
        </Button>
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
          <aside className="min-h-0 w-[26rem] shrink-0 overflow-y-auto border-l border-solid border-foreground/10 bg-card">
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
            <aside className="flex min-h-0 w-[26rem] shrink-0 flex-col border-l border-solid border-foreground/10 bg-card">
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
