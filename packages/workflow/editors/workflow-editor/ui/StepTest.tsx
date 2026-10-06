// Test step, the Activepieces way: run one step against the last tests of
// the blocks it reads, and show what it produced right in the panel.
import { useState } from "react";
import { Button } from "../../shared/controls.js";
import { DataViewer } from "../../shared/data-viewer.js";
import { Icon } from "../../shared/icons.js";
import { useRunById, useTestStepRunner } from "./design-time.js";
import type { StepTestOutcome } from "./forms.js";
import { VARIABLES_VIEW, type StepModel, type WorkflowModel } from "./model.js";
import {
  explainTestError,
  testOutcomeView,
  type TestErrorTarget,
} from "./step-test.js";
import { relativeTime, testState } from "./test-state.js";

type Attempt =
  | { kind: "running" }
  | { kind: "done"; outcome: StepTestOutcome }
  | { kind: "error"; message: string };

// "Tested 2h ago", "Test failed 5m ago" or "Not tested yet", with staleness.
export function TestedLine(props: {
  block: StepModel | NonNullable<WorkflowModel["trigger"]>;
  noun: string;
}) {
  const { block } = props;
  const run = useRunById(block.lastTest?.runId);
  if (!block.lastTest) {
    return (
      <span className="text-xs text-muted-foreground">Not tested yet</span>
    );
  }
  const state = testState(block, run?.status);
  return (
    <span
      className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground"
      title={new Date(block.lastTest.testedAt).toLocaleString()}
    >
      <span
        className={
          state === "failed" ? "font-medium text-wf-fail" : "text-foreground"
        }
      >
        {state === "failed" ? "Test failed" : "Tested"}{" "}
        {relativeTime(block.lastTest.testedAt)}
      </span>
      {state === "stale" ? (
        <span className="text-wf-warn">
          The {props.noun} changed since, so test it again.
        </span>
      ) : null}
    </span>
  );
}

function targetLabel(target: TestErrorTarget, model: WorkflowModel): string {
  if (target.kind === "trigger") return "Open the trigger";
  if (target.kind === "variables") return "Open variables";
  const step = model.steps.find((entry) => entry.key === target.key);
  return `Open ${step?.name || target.key}`;
}

function targetId(
  target: TestErrorTarget,
  model: WorkflowModel,
): string | undefined {
  if (target.kind === "trigger") return model.trigger?.id;
  if (target.kind === "variables") return VARIABLES_VIEW;
  return model.steps.find((entry) => entry.key === target.key)?.id;
}

function TestError(props: {
  error: string;
  // False when the runtime refused before running anything.
  ran: boolean;
  model: WorkflowModel;
  onSelect?: (id: string) => void;
}) {
  const explained = explainTestError(props.error);
  return (
    <div
      role="alert"
      className="flex flex-col gap-1.5 rounded-md bg-wf-fail/10 p-2.5 text-xs text-wf-fail"
    >
      <span className="whitespace-pre-wrap break-words">
        {props.ran ? null : <span className="font-medium">Nothing ran. </span>}
        {explained.message}
      </span>
      {props.onSelect && explained.targets.length > 0 ? (
        <span className="flex flex-wrap gap-x-3">
          {explained.targets.map((target) => {
            const id = targetId(target, props.model);
            if (!id) return null;
            return (
              <button
                key={id}
                type="button"
                className="font-medium underline underline-offset-2 hover:no-underline"
                onClick={() => props.onSelect!(id)}
              >
                {targetLabel(target, props.model)}
              </button>
            );
          })}
        </span>
      ) : null}
    </div>
  );
}

// Neither a pass nor a failure: a write the step asked for may have landed.
function TestIndeterminate(props: { error: string }) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-1.5 rounded-md bg-wf-warn/10 p-2.5 text-xs text-wf-warn"
    >
      <span className="font-medium">
        Indeterminate: this test may have written something. Check the target
        before testing again.
      </span>
      <span className="whitespace-pre-wrap break-words">{props.error}</span>
    </div>
  );
}

// What the last test left behind, read back from its run.
function LastTestResult(props: {
  step: StepModel;
  model: WorkflowModel;
  onSelect?: (id: string) => void;
}) {
  const run = useRunById(props.step.lastTest?.runId);
  if (!props.step.lastTest) return null;
  if (run === undefined) {
    return <div className="h-12 animate-pulse rounded-md bg-foreground/5" />;
  }
  if (run === null) {
    return (
      <p className="text-xs text-muted-foreground">
        That test run is no longer kept.
      </p>
    );
  }
  const record = run.steps.at(0);
  const error = record?.error ?? run.error;
  if (error) {
    return (
      <TestError
        error={error}
        ran
        model={props.model}
        onSelect={props.onSelect}
      />
    );
  }
  return (
    <DataViewer
      label="Output"
      value={record?.output}
      root={`steps.${props.step.key}.output`}
    />
  );
}

export function StepTestSection(props: {
  step: StepModel;
  model: WorkflowModel;
  onSelect?: (id: string) => void;
}) {
  const { step } = props;
  const runTest = useTestStepRunner();
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const running = attempt?.kind === "running";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <TestedLine block={step} noun="step" />
        {runTest ? (
          <Button
            size="sm"
            disabled={running}
            aria-busy={running}
            onClick={() => {
              setAttempt({ kind: "running" });
              runTest(step.id).then(
                (outcome) => setAttempt({ kind: "done", outcome }),
                (error: unknown) =>
                  setAttempt({
                    kind: "error",
                    message:
                      error instanceof Error ? error.message : String(error),
                  }),
              );
            }}
          >
            <Icon name="play" className="h-3.5 w-3.5" />
            {running ? "Testing…" : "Test step"}
          </Button>
        ) : null}
      </div>
      {attempt === null ? (
        <LastTestResult
          step={step}
          model={props.model}
          onSelect={props.onSelect}
        />
      ) : attempt.kind === "running" ? (
        <div
          role="status"
          aria-label="Testing the step"
          className="h-12 animate-pulse rounded-md bg-foreground/5"
        />
      ) : attempt.kind === "error" ? (
        <TestError
          error={attempt.message}
          ran={false}
          model={props.model}
          onSelect={props.onSelect}
        />
      ) : testOutcomeView(attempt.outcome.status) === "failed" ? (
        <TestError
          error={attempt.outcome.error ?? "The test failed"}
          ran={attempt.outcome.runId !== null}
          model={props.model}
          onSelect={props.onSelect}
        />
      ) : testOutcomeView(attempt.outcome.status) === "indeterminate" ? (
        <TestIndeterminate
          error={attempt.outcome.error ?? "A host call the step made timed out"}
        />
      ) : (
        <DataViewer
          label="Output"
          value={attempt.outcome.output}
          root={`steps.${step.key}.output`}
        />
      )}
    </div>
  );
}
