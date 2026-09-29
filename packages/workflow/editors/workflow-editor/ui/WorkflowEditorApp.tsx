import { useMemo, useState, type ReactNode } from "react";
import { Button } from "../../shared/controls.js";
import { Icon } from "../../shared/icons.js";
import {
  ExpressionPickerPopup,
  ExpressionTargetProvider,
} from "./ExpressionPicker.js";
import {
  hasDraftChanges,
  VARIABLES_VIEW,
  type WorkflowEditorCallbacks,
  type WorkflowModel,
} from "./model.js";
import {
  DraftBanner,
  PublishButton,
  PublishState,
  StatusToggle,
  usePublish,
} from "./PublishControls.js";
import { StepPanel, TriggerPanel } from "./StepPanel.js";
import { useWorkflowCheck } from "./use-validity.js";
import { VariablesEditor } from "./VariablesEditor.js";
import { useBlockResolutions, useDesignTime } from "./design-time.js";
import { BlockResolutionsProvider, VersionSummary } from "./version-badge.js";
import { stepBlock, triggerBlock } from "./blocks.js";
import { WorkflowCanvas } from "./WorkflowCanvas.js";

export function WorkflowEditorApp(props: {
  model: WorkflowModel;
  callbacks: WorkflowEditorCallbacks;
  // Host controls around the header: a way out before, run facts after.
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  const { model, callbacks } = props;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { publishing, error: publishError, publish } = usePublish(callbacks);
  const { readiness } = useWorkflowCheck(model);

  const selectedStep = model.steps.find((step) => step.id === selectedId);
  const selectedTrigger =
    model.trigger && model.trigger.id === selectedId ? model.trigger : null;
  const showVariables = selectedId === VARIABLES_VIEW;
  const workflowId = useDesignTime()?.workflowId ?? "";
  const trigger = useMemo(
    () => (model.trigger ? triggerBlock(model.trigger) : undefined),
    [model.trigger],
  );
  const blocks = useMemo(
    () => [
      ...(model.trigger && trigger
        ? [{ id: model.trigger.id, block: trigger }]
        : []),
      ...model.steps.map((step) => ({ id: step.id, block: stepBlock(step) })),
    ],
    [model.trigger, trigger, model.steps],
  );
  const resolutions = useBlockResolutions(workflowId, blocks);
  const draftBlocks = useMemo(
    () => blocks.map((entry) => entry.block),
    [blocks],
  );
  const stepBlocks = useMemo(
    () =>
      Object.fromEntries(
        model.steps.map((step) => [step.key, stepBlock(step)]),
      ),
    [model.steps],
  );

  return (
    <BlockResolutionsProvider resolutions={resolutions} blocks={draftBlocks}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-solid border-foreground/10 bg-background px-4 py-2">
          {props.leading ? (
            <>
              {props.leading}
              <span aria-hidden className="h-5 w-px bg-foreground/10" />
            </>
          ) : null}
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
          <PublishState model={model} />
          <VersionSummary resolutions={resolutions} onSelect={setSelectedId} />
          <span className="ml-auto flex items-center gap-3">
            {props.trailing}
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
          <span aria-hidden className="h-5 w-px bg-foreground/10" />
          <StatusToggle
            published={Boolean(model.published)}
            status={model.status}
            onChange={callbacks.setStatus}
          />
          {/* The draft banner shows it, unless the snapshot landed and enabling failed. */}
          {publishError && !hasDraftChanges(model) ? (
            <span
              role="alert"
              className="max-w-64 truncate text-xs text-wf-fail"
              title={publishError}
            >
              {publishError}
            </span>
          ) : null}
          <PublishButton
            model={model}
            readiness={readiness}
            publishing={publishing}
            onPublish={publish}
            onSelect={setSelectedId}
          />
        </div>
        <div className="flex min-h-0 flex-1">
          <div className="relative min-h-[480px] min-w-0 flex-1">
            <WorkflowCanvas
              model={model}
              callbacks={callbacks}
              onSelect={setSelectedId}
            />
            <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-4">
              <DraftBanner
                model={model}
                readiness={readiness}
                publishing={publishing}
                error={publishError}
                onPublish={publish}
                onDiscard={callbacks.discardChanges}
                onSelect={setSelectedId}
              />
            </div>
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
              stepBlocks={stepBlocks}
              triggerBlock={trigger}
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
                      onSelect={setSelectedId}
                      readOnly={model.readOnly}
                    />
                  ) : null}
                  {selectedTrigger ? (
                    <TriggerPanel
                      key={selectedTrigger.id}
                      trigger={selectedTrigger}
                      callbacks={callbacks}
                      onClose={() => setSelectedId(null)}
                      readOnly={model.readOnly}
                    />
                  ) : null}
                </div>
                <ExpressionPickerPopup />
              </aside>
            </ExpressionTargetProvider>
          ) : null}
        </div>
      </div>
    </BlockResolutionsProvider>
  );
}
