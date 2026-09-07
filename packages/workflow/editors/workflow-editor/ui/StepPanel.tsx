import { useEffect, useRef, useState } from "react";
import { acyclicTargets, reachableFrom } from "./ap-layout.js";
import { ConnectionField } from "./ConnectionField.js";
import {
  ExpressionPickerButton,
  ExpressionTokenLine,
  useExpressionField,
} from "./ExpressionPicker.js";
import type { BlockForm, DesignTimeService } from "./forms.js";
import {
  flowPorts,
  type RetryPolicyModel,
  type StepModel,
  type TriggerModel,
  type WorkflowEditorCallbacks,
  type WorkflowModel,
} from "./model.js";
import { AvailableSoon, PropertyForm } from "./PropertyForm.js";
import { missingForBlock } from "./validation.js";

function stringify(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

function Field(props: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {props.label}
      </span>
      {props.children}
      {props.hint ? (
        <p className="mt-0.5 text-[11px] text-slate-400">{props.hint}</p>
      ) : null}
    </label>
  );
}

const inputClass =
  "w-full rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-800";

function RawConfigEditor(props: {
  value: unknown;
  onApply: (config: unknown) => void;
}) {
  const [text, setText] = useState(() => stringify(props.value));
  const [error, setError] = useState<string | null>(null);
  const [prevValue, setPrevValue] = useState(props.value);
  if (props.value !== prevValue) {
    setPrevValue(props.value);
    setText(stringify(props.value));
  }
  return (
    <div>
      <textarea
        className={`${inputClass} min-h-32 font-mono text-xs`}
        value={text}
        onChange={(event) => setText(event.target.value)}
        spellCheck={false}
      />
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
      <button
        type="button"
        className="mt-1 rounded bg-slate-800 px-3 py-1 text-xs font-medium text-white"
        onClick={() => {
          try {
            props.onApply(JSON.parse(text));
            setError(null);
          } catch (parseError) {
            setError(
              parseError instanceof Error ? parseError.message : "Invalid JSON",
            );
          }
        }}
      >
        Apply JSON
      </button>
    </div>
  );
}

// Loads the block's form descriptor; null means "no form, fall back to JSON".
function useBlockForm(
  blockType: string,
  designTime?: DesignTimeService,
): BlockForm | null | "loading" {
  const [state, setState] = useState<{
    blockType: string;
    form: BlockForm | null | "loading";
  }>({ blockType, form: designTime ? "loading" : null });
  if (state.blockType !== blockType) {
    setState({ blockType, form: designTime ? "loading" : null });
  }
  useEffect(() => {
    if (!designTime) return;
    let alive = true;
    designTime.getBlockForm(blockType).then(
      (result) => {
        if (alive) setState({ blockType, form: result });
      },
      () => {
        if (alive) setState({ blockType, form: null });
      },
    );
    return () => {
      alive = false;
    };
  }, [blockType, designTime]);
  return state.form;
}

function ConfigSection(props: {
  blockType: string;
  form: BlockForm | null | "loading";
  config: unknown;
  onChange: (config: unknown) => void;
  designTime?: DesignTimeService;
  connectionId?: string;
  // Step whose config this is; scopes the expression picker to its ancestors.
  scopeStepId?: string;
}) {
  const { form } = props;
  const configRecord = (props.config ?? {}) as Record<string, unknown>;

  return (
    <div className="flex flex-col gap-3">
      {form === "loading" ? (
        <p className="text-xs text-slate-400">Loading block properties…</p>
      ) : null}
      {form && form !== "loading" && form.props.length > 0 ? (
        <PropertyForm
          props={form.props}
          value={configRecord}
          onChange={props.onChange}
          scopeStepId={props.scopeStepId}
          connectionId={props.connectionId}
          loadOptions={
            props.designTime
              ? (propName, current) =>
                  props.designTime!.loadOptions(
                    props.blockType,
                    propName,
                    current,
                    props.connectionId,
                  )
              : undefined
          }
        />
      ) : null}
      {form && form !== "loading" && form.props.length === 0 ? (
        <p className="text-xs text-slate-400">
          This block has no configuration.
        </p>
      ) : null}
      <details className="mt-1">
        <summary className="cursor-pointer text-[11px] text-slate-400">
          Raw JSON
        </summary>
        <div className="mt-2">
          <RawConfigEditor value={props.config} onApply={props.onChange} />
        </div>
      </details>
    </div>
  );
}

function PanelHeader(props: {
  title: string;
  missing: string[];
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        {props.title}
        {props.missing.length > 0 ? (
          <span
            className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
            title={props.missing.join(", ")}
          >
            {props.missing.length} required
          </span>
        ) : null}
      </h3>
      <button
        type="button"
        className="text-xs text-slate-400"
        onClick={props.onClose}
      >
        Close
      </button>
    </div>
  );
}

const DEFAULT_RETRY: RetryPolicyModel = {
  maxAttempts: 3,
  backoff: "EXPONENTIAL",
  initialDelaySeconds: 5,
  maxDelaySeconds: 300,
  retryOn: [],
};

function intOrUndefined(raw: string): number | undefined {
  const parsed = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function RetryEditor(props: {
  value: RetryPolicyModel | null;
  onChange: (value: RetryPolicyModel | null) => void;
}) {
  const retry = props.value;
  const patch = (partial: Partial<RetryPolicyModel>) =>
    props.onChange({ ...(retry ?? DEFAULT_RETRY), ...partial });
  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={retry !== null}
          onChange={(event) =>
            props.onChange(event.target.checked ? DEFAULT_RETRY : null)
          }
        />
        Override retry policy
      </label>
      {retry ? (
        <div className="grid grid-cols-2 gap-2 rounded border border-slate-200 p-2">
          <Field label="Max attempts">
            <input
              key={`attempts-${retry.maxAttempts}`}
              type="number"
              min={1}
              className={inputClass}
              defaultValue={retry.maxAttempts}
              onBlur={(event) => {
                const next = intOrUndefined(event.target.value);
                if (next !== undefined && next >= 1)
                  patch({ maxAttempts: next });
              }}
            />
          </Field>
          <Field label="Backoff">
            <select
              className={inputClass}
              value={retry.backoff}
              onChange={(event) =>
                patch({
                  backoff: event.target.value as RetryPolicyModel["backoff"],
                })
              }
            >
              <option value="FIXED">Fixed</option>
              <option value="EXPONENTIAL">Exponential</option>
            </select>
          </Field>
          <Field label="Initial delay (s)">
            <input
              key={`initial-${retry.initialDelaySeconds}`}
              type="number"
              min={0}
              className={inputClass}
              defaultValue={retry.initialDelaySeconds}
              onBlur={(event) => {
                const next = intOrUndefined(event.target.value);
                if (next !== undefined) patch({ initialDelaySeconds: next });
              }}
            />
          </Field>
          <Field label="Max delay (s)">
            <input
              key={`max-${retry.maxDelaySeconds}`}
              type="number"
              min={0}
              className={inputClass}
              defaultValue={retry.maxDelaySeconds}
              onBlur={(event) => {
                const next = intOrUndefined(event.target.value);
                if (next !== undefined) patch({ maxDelaySeconds: next });
              }}
            />
          </Field>
          <div className="col-span-2">
            <Field
              label="Retry on"
              hint="Comma-separated error classes; empty retries everything"
            >
              <input
                key={`on-${retry.retryOn.join(",")}`}
                className={`${inputClass} font-mono text-xs`}
                defaultValue={retry.retryOn.join(", ")}
                placeholder="TRANSIENT, RATE_LIMIT"
                onBlur={(event) =>
                  patch({
                    retryOn: event.target.value
                      .split(",")
                      .map((entry) => entry.trim())
                      .filter((entry) => entry !== ""),
                  })
                }
              />
            </Field>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const PORT_LABEL: Record<string, string> = {
  next: "Next step",
  true: "When true",
  false: "When false",
};

// A port may hold several edges: the engine runs every successor on a taken
// port. acyclicTargets offers any step that is not an ancestor.
function FlowPortEditor(props: {
  step: StepModel;
  model: WorkflowModel;
  callbacks: WorkflowEditorCallbacks;
}) {
  const { step, model, callbacks } = props;
  const ports = flowPorts(step.blockType);
  const stepName = (id: string) => {
    const target = model.steps.find((entry) => entry.id === id);
    return target ? target.name || target.key : id;
  };
  const attached = model.trigger
    ? reachableFrom(model.trigger.id, model.edges)
    : new Set<string>();
  const candidates = acyclicTargets(model, step.id);
  return (
    <Field
      label={ports.length > 1 ? "Branches" : "Connects to"}
      hint="Any step that is not upstream of this one, connected or not"
    >
      <div className="flex flex-col gap-2">
        {ports.map((port) => {
          const edges = model.edges.filter(
            (candidate) =>
              candidate.from === step.id && candidate.port === port,
          );
          const targets = candidates.filter(
            (candidate) => !edges.some((edge) => edge.to === candidate.id),
          );
          return (
            <div key={port} className="flex flex-col gap-1">
              {ports.length > 1 ? (
                <span className="text-[11px] font-medium text-slate-500">
                  {PORT_LABEL[port] ?? port}
                </span>
              ) : null}
              {edges.map((edge) => (
                <div
                  key={edge.id}
                  className="flex min-w-0 items-center justify-between rounded border border-solid border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700"
                >
                  <span className="truncate">→ {stepName(edge.to)}</span>
                  <button
                    type="button"
                    className="ml-2 shrink-0 text-[11px] text-red-500"
                    onClick={() => callbacks.removeEdge(edge.id)}
                  >
                    Disconnect
                  </button>
                </div>
              ))}
              <select
                className={inputClass}
                value=""
                disabled={targets.length === 0}
                onChange={(event) => {
                  if (event.target.value === "") return;
                  callbacks.addEdge({
                    from: step.id,
                    to: event.target.value,
                    port,
                  });
                }}
              >
                <option value="">
                  {targets.length === 0
                    ? "No other step to connect to"
                    : edges.length > 0
                      ? "Also connect to…"
                      : "Connect to…"}
                </option>
                {targets.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.name || target.key}
                    {attached.has(target.id) ? "" : " · detached"}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </Field>
  );
}

function ErrorPortEditor(props: {
  step: StepModel;
  model: WorkflowModel;
  callbacks: WorkflowEditorCallbacks;
}) {
  const { step, model, callbacks } = props;
  const errorEdges = model.edges.filter(
    (edge) => edge.from === step.id && edge.port === "error",
  );
  const stepName = (id: string) => {
    const target = model.steps.find((entry) => entry.id === id);
    return target ? target.name || target.key : id;
  };
  const targets = acyclicTargets(model, step.id).filter(
    (candidate) => !errorEdges.some((edge) => edge.to === candidate.id),
  );
  return (
    <Field
      label="On error"
      hint="Route failures to another step instead of failing the run"
    >
      <div className="flex flex-col gap-1">
        {errorEdges.map((edge) => (
          <div
            key={edge.id}
            className="flex items-center justify-between rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800"
          >
            <span>→ {stepName(edge.to)}</span>
            <button
              type="button"
              className="text-[11px] text-red-500"
              onClick={() => callbacks.removeEdge(edge.id)}
            >
              Remove
            </button>
          </div>
        ))}
        <select
          className={inputClass}
          value=""
          disabled={targets.length === 0}
          onChange={(event) => {
            if (event.target.value === "") return;
            callbacks.addEdge({
              from: step.id,
              to: event.target.value,
              port: "error",
            });
          }}
        >
          <option value="">
            {targets.length === 0
              ? "No other step to route to"
              : errorEdges.length > 0
                ? "Add another error target…"
                : "Route errors to…"}
          </option>
          {targets.map((target) => (
            <option key={target.id} value={target.id}>
              {target.name || target.key}
            </option>
          ))}
        </select>
      </div>
    </Field>
  );
}

// Splices text at the field's cursor and returns the updated value.
function insertAtCursor(element: HTMLInputElement, text: string): string {
  const start = element.selectionStart ?? element.value.length;
  const end = element.selectionEnd ?? start;
  element.value =
    element.value.slice(0, start) + text + element.value.slice(end);
  return element.value;
}

function IdempotencyField(props: {
  step: StepModel;
  callbacks: WorkflowEditorCallbacks;
}) {
  const { step, callbacks } = props;
  const ref = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(step.idempotencyKeyExpression ?? "");
  const commit = (raw: string) => {
    const next = raw.trim() || null;
    if (next !== step.idempotencyKeyExpression) {
      callbacks.updateStep({ id: step.id, idempotencyKeyExpression: next });
    }
  };
  const field = useExpressionField({
    stepId: step.id,
    label: "Idempotency key",
    insert: (expression) => {
      if (!ref.current) return;
      const next = insertAtCursor(ref.current, expression);
      setDraft(next);
      commit(next);
    },
  });
  return (
    <label className="block">
      <span className="mb-1 flex items-end justify-between gap-1">
        <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Idempotency key
        </span>
        <ExpressionPickerButton
          active={field.active}
          onFocusField={field.focus}
        />
      </span>
      <input
        ref={ref}
        key={`${step.id}-idem`}
        className={`${inputClass} font-mono text-xs`}
        defaultValue={step.idempotencyKeyExpression ?? ""}
        placeholder="{{trigger.payload.id}}"
        spellCheck={false}
        onFocus={field.focus}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => commit(event.target.value)}
      />
      <ExpressionTokenLine value={draft} />
      <p className="mt-0.5 text-[11px] text-slate-400">
        Two executions with the same key count as one side effect
      </p>
    </label>
  );
}

function AdvancedSection(props: {
  step: StepModel;
  model: WorkflowModel;
  callbacks: WorkflowEditorCallbacks;
}) {
  const { step, callbacks } = props;
  const customised =
    step.retry !== null ||
    step.timeoutSeconds !== null ||
    step.idempotencyKeyExpression !== null ||
    props.model.edges.some(
      (edge) => edge.from === step.id && edge.port === "error",
    );
  return (
    <details
      className="rounded border border-slate-200 bg-white"
      open={customised}
    >
      <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Advanced
        {customised ? (
          <span className="ml-2 font-normal normal-case tracking-normal text-slate-400">
            customised
          </span>
        ) : null}
      </summary>
      <div className="flex flex-col gap-3 border-t border-slate-100 p-3">
        <Field label="Timeout (seconds)" hint="Empty uses the runtime default">
          <input
            key={`${step.id}-timeout-${step.timeoutSeconds ?? ""}`}
            type="number"
            min={1}
            className={inputClass}
            defaultValue={step.timeoutSeconds ?? ""}
            onBlur={(event) => {
              const raw = event.target.value.trim();
              const next = raw === "" ? null : intOrUndefined(raw);
              if (next === undefined || next === 0) return;
              if (next !== step.timeoutSeconds) {
                callbacks.updateStep({ id: step.id, timeoutSeconds: next });
              }
            }}
          />
        </Field>
        {/* Stored on the step, but the runtime does not enforce them yet. */}
        <fieldset
          disabled
          className="m-0 flex min-w-0 flex-col gap-3 rounded border border-dashed border-amber-200 p-2 opacity-80"
        >
          <legend className="px-1">
            <AvailableSoon>retry policy and idempotency key</AvailableSoon>
          </legend>
          <RetryEditor
            value={step.retry}
            onChange={(retry) => callbacks.updateStep({ id: step.id, retry })}
          />
          <IdempotencyField step={step} callbacks={callbacks} />
        </fieldset>
        <ErrorPortEditor
          step={step}
          model={props.model}
          callbacks={callbacks}
        />
      </div>
    </details>
  );
}

export function StepPanel(props: {
  step: StepModel;
  model: WorkflowModel;
  callbacks: WorkflowEditorCallbacks;
  onClose: () => void;
  designTime?: DesignTimeService;
}) {
  const { step, callbacks } = props;
  const form = useBlockForm(step.blockType, props.designTime);
  const missing = missingForBlock(form, step.config, step.connectionId);
  return (
    <div className="flex flex-col gap-3 p-4">
      <PanelHeader title="Step" missing={missing} onClose={props.onClose} />
      <Field label="Name">
        <input
          key={`${step.id}-name`}
          className={inputClass}
          defaultValue={step.name}
          onBlur={(event) => {
            const name = event.target.value.trim();
            if (name && name !== step.name)
              callbacks.updateStep({ id: step.id, name });
          }}
        />
      </Field>
      <Field label="Key (used in expressions)">
        <input
          key={`${step.id}-key`}
          className={inputClass}
          defaultValue={step.key}
          onBlur={(event) => {
            const key = event.target.value.trim();
            if (key && key !== step.key)
              callbacks.updateStep({ id: step.id, key });
          }}
        />
      </Field>
      <ConnectionField
        key={`${step.id}-conn`}
        blockType={step.blockType}
        value={step.connectionId ?? ""}
        onChange={(connectionId) =>
          callbacks.updateStep({ id: step.id, connectionId })
        }
        designTime={props.designTime}
      />
      <ConfigSection
        key={`${step.id}-config`}
        blockType={step.blockType}
        form={form}
        config={step.config}
        onChange={(config) => callbacks.updateStep({ id: step.id, config })}
        designTime={props.designTime}
        connectionId={step.connectionId ?? undefined}
        scopeStepId={step.id}
      />
      <FlowPortEditor
        key={`${step.id}-flow`}
        step={step}
        model={props.model}
        callbacks={callbacks}
      />
      <AdvancedSection step={step} model={props.model} callbacks={callbacks} />
      <button
        type="button"
        className="mt-2 rounded border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600"
        onClick={() => {
          callbacks.removeStep(step.id);
          props.onClose();
        }}
      >
        Remove step
      </button>
    </div>
  );
}

function TestTriggerSection(props: { onTest: () => Promise<unknown> }) {
  const [state, setState] = useState<
    { kind: "idle" } | { kind: "loading" } | { kind: "done"; result: string }
  >({ kind: "idle" });
  return (
    <div>
      <button
        type="button"
        className="rounded bg-slate-800 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        disabled={state.kind === "loading"}
        onClick={() => {
          setState({ kind: "loading" });
          props.onTest().then(
            (result) =>
              setState({
                kind: "done",
                result: JSON.stringify(result, null, 2),
              }),
            (error: unknown) =>
              setState({
                kind: "done",
                result: error instanceof Error ? error.message : String(error),
              }),
          );
        }}
      >
        {state.kind === "loading" ? "Testing…" : "Test trigger"}
      </button>
      {state.kind === "done" ? (
        <pre className="mt-2 max-h-48 overflow-auto rounded border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-700">
          {state.result}
        </pre>
      ) : null}
    </div>
  );
}

export function TriggerPanel(props: {
  trigger: TriggerModel;
  callbacks: WorkflowEditorCallbacks;
  onClose: () => void;
  designTime?: DesignTimeService;
}) {
  const { trigger, callbacks } = props;
  const isPieceTrigger = trigger.blockType.includes("#trigger:");
  const form = useBlockForm(trigger.blockType, props.designTime);
  const missing = missingForBlock(form, trigger.config, trigger.connectionId);
  const setTrigger = (patch: {
    config?: unknown;
    connectionId?: string | null;
  }) =>
    callbacks.setTrigger({
      blockType: trigger.blockType,
      config: patch.config === undefined ? trigger.config : patch.config,
      connectionId:
        patch.connectionId === undefined
          ? trigger.connectionId
          : patch.connectionId,
    });
  return (
    <div className="flex flex-col gap-3 p-4">
      <PanelHeader title="Trigger" missing={missing} onClose={props.onClose} />
      {isPieceTrigger ? (
        <ConnectionField
          key={`${trigger.id}-conn`}
          blockType={trigger.blockType}
          value={trigger.connectionId ?? ""}
          onChange={(connectionId) => setTrigger({ connectionId })}
          designTime={props.designTime}
        />
      ) : null}
      <ConfigSection
        key={trigger.id}
        blockType={trigger.blockType}
        form={form}
        config={trigger.config}
        onChange={(config) => setTrigger({ config })}
        designTime={props.designTime}
        connectionId={trigger.connectionId ?? undefined}
      />
      {isPieceTrigger && props.designTime?.testTrigger ? (
        <TestTriggerSection onTest={props.designTime.testTrigger} />
      ) : null}
      <button
        type="button"
        className="mt-2 rounded border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600"
        onClick={() => {
          callbacks.clearTrigger();
          props.onClose();
        }}
      >
        Remove trigger
      </button>
    </div>
  );
}
