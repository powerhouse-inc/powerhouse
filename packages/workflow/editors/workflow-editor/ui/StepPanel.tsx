import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  Button,
  FieldError,
  FieldLabel,
  Hint,
  IconButton,
  Select,
  Switch,
  Tabs,
  textAreaClass,
  textInputClass,
} from "../../shared/controls.js";
import { Icon } from "../../shared/icons.js";
import { acyclicTargets, flowOrder, reachableFrom } from "./ap-layout.js";
import { useBlockMeta } from "./block-meta.js";
import { BlockLogo } from "./BlockSelector.js";
import { ConnectionField } from "./ConnectionField.js";
import {
  ExpressionPickerButton,
  ExpressionTokenLine,
  useExpressionField,
} from "./ExpressionPicker.js";
import type {
  BlockForm,
  DesignTimeService,
  LatestRun,
  WebhookEndpoint,
} from "./forms.js";
import {
  flowPorts,
  type RetryPolicyModel,
  type StepModel,
  type TriggerModel,
  type WorkflowEditorCallbacks,
  type WorkflowModel,
} from "./model.js";
import { AvailableSoon, PropertyForm } from "./PropertyForm.js";
import { DataViewer } from "../../shared/data-viewer.js";
import { ScheduleBuilder } from "./ScheduleBuilder.js";
import { describeTrigger } from "./trigger-text.js";
import { missingForBlock } from "./validation.js";

function stringify(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

function Section(props: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 border-t border-solid border-foreground/10 pt-5 first:border-t-0 first:pt-0">
      <div>
        <h4 className="text-[13px] font-semibold text-foreground">
          {props.title}
        </h4>
        {props.description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {props.description}
          </p>
        ) : null}
      </div>
      {props.children}
    </section>
  );
}

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
  const dirty = text !== stringify(props.value);
  return (
    <div>
      <textarea
        aria-label="Configuration as JSON"
        className={`${textAreaClass} min-h-40 font-mono text-xs`}
        value={text}
        onChange={(event) => setText(event.target.value)}
        spellCheck={false}
      />
      <FieldError>{error}</FieldError>
      <div className="mt-2 flex gap-2">
        <Button
          size="sm"
          disabled={!dirty}
          onClick={() => {
            try {
              props.onApply(JSON.parse(text));
              setError(null);
            } catch (parseError) {
              setError(
                parseError instanceof Error
                  ? parseError.message
                  : "Not valid JSON",
              );
            }
          }}
        >
          Apply JSON
        </Button>
        {dirty ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setText(stringify(props.value));
              setError(null);
            }}
          >
            Discard
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// Loads the block's form descriptor; null means "no form, fall back to JSON".
// A refusal keeps its message, so a block that cannot run says why.
function useBlockForm(
  blockType: string,
  designTime?: DesignTimeService,
): { form: BlockForm | null | "loading"; error?: string } {
  const [state, setState] = useState<{
    blockType: string;
    form: BlockForm | null | "loading";
    error?: string;
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
      (error: unknown) => {
        if (!alive) return;
        setState({
          blockType,
          form: null,
          error: error instanceof Error ? error.message : String(error),
        });
      },
    );
    return () => {
      alive = false;
    };
  }, [blockType, designTime]);
  return { form: state.form, error: state.error };
}

function FormSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-5" aria-label="Loading">
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex flex-col gap-2">
          <div className="h-3 w-24 rounded bg-foreground/10" />
          <div className="h-9 rounded-md bg-foreground/5" />
        </div>
      ))}
    </div>
  );
}

function ConfigSection(props: {
  blockType: string;
  form: BlockForm | null | "loading";
  formError?: string;
  config: unknown;
  onChange: (config: unknown) => void;
  designTime?: DesignTimeService;
  connectionId?: string;
  // Step whose config this is; scopes the expression picker to its ancestors.
  scopeStepId?: string;
  // Substituted into a piece's setup markdown; triggers only.
  webhookUrl?: string;
}) {
  const { form } = props;
  const configRecord = (props.config ?? {}) as Record<string, unknown>;

  if (form === "loading") return <FormSkeleton />;
  return (
    <div className="flex flex-col gap-5">
      {props.formError ? (
        <p className="rounded-md bg-wf-fail/10 px-3 py-2 text-xs text-wf-fail">
          {props.formError}
        </p>
      ) : null}
      {form && form.props.length > 0 ? (
        <PropertyForm
          props={form.props}
          value={configRecord}
          onChange={props.onChange}
          scopeStepId={props.scopeStepId}
          connectionId={props.connectionId}
          secrets={props.designTime?.secrets}
          webhookUrl={props.webhookUrl}
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
      {form && form.props.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          Nothing to set up. This block runs as it is.
        </p>
      ) : null}
      {!form && !props.formError ? (
        <p className="text-[13px] text-muted-foreground">
          This block has no form. Edit its configuration as JSON under Settings.
        </p>
      ) : null}
    </div>
  );
}

// Name, piece and readiness at the top of the panel; the name edits in place.
function PanelHeader(props: {
  blockType: string;
  name: string;
  onRename?: (name: string) => void;
  actionLabel: string;
  missing: string[];
  loading: boolean;
  onClose: () => void;
  position?: {
    index: number;
    total: number;
    onPrevious?: () => void;
    onNext?: () => void;
  };
  children?: ReactNode;
}) {
  return (
    <header className="border-b border-solid border-foreground/10 px-4 pt-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-solid border-foreground/10 bg-card">
          <BlockLogo blockType={props.blockType} size={24} />
        </div>
        <div className="min-w-0 flex-1">
          {props.onRename ? (
            <input
              key={props.name}
              aria-label="Step name"
              className="-mx-1 w-full rounded-md border border-solid border-transparent bg-transparent px-1 text-[15px] font-semibold text-foreground hover:border-foreground/15 focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/25"
              defaultValue={props.name}
              spellCheck={false}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") {
                  event.currentTarget.value = props.name;
                  event.currentTarget.blur();
                }
              }}
              onBlur={(event) => {
                const name = event.target.value.trim();
                if (name && name !== props.name) props.onRename!(name);
                else event.target.value = props.name;
              }}
            />
          ) : (
            <h3 className="truncate text-[15px] font-semibold text-foreground">
              {props.name}
            </h3>
          )}
          <p className="truncate text-xs text-muted-foreground">
            {props.actionLabel}
          </p>
        </div>
        {props.position ? (
          <div className="flex shrink-0 items-center">
            <IconButton
              icon="back"
              label="Previous step"
              disabled={!props.position.onPrevious}
              onClick={props.position.onPrevious}
            />
            <span className="px-0.5 text-xs tabular-nums text-muted-foreground">
              {props.position.index + 1} of {props.position.total}
            </span>
            <IconButton
              icon="chevron"
              label="Next step"
              disabled={!props.position.onNext}
              onClick={props.position.onNext}
            />
          </div>
        ) : null}
        <IconButton icon="close" label="Close panel" onClick={props.onClose} />
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-xs">
        {props.loading ? (
          <span className="text-muted-foreground">Checking setup…</span>
        ) : props.missing.length > 0 ? (
          <span
            className="flex min-w-0 items-center gap-1.5 text-wf-warn"
            title={props.missing.join(", ")}
          >
            <Icon name="alert" className="h-3.5 w-3.5" />
            <span className="truncate">
              {props.missing.length === 1
                ? `${props.missing[0]} needs a value`
                : `${props.missing.length} fields need a value: ${props.missing.join(", ")}`}
            </span>
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-wf-ok">
            <Icon name="check" className="h-3.5 w-3.5" />
            Ready to run
          </span>
        )}
      </div>
      <div className="mt-3">{props.children}</div>
    </header>
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

// A number input with its unit drawn inside the field.
function NumberField(props: {
  label: string;
  value: number | null;
  unit?: string;
  min?: number;
  placeholder?: string;
  hint?: string;
  onCommit: (value: number | null) => void;
}) {
  return (
    <label className="block">
      <FieldLabel label={props.label} />
      <span className="relative block">
        <input
          key={`${props.label}-${props.value ?? ""}`}
          type="number"
          min={props.min}
          className={`${textInputClass} ${props.unit ? "pr-16" : ""}`}
          defaultValue={props.value ?? ""}
          placeholder={props.placeholder}
          onBlur={(event) => {
            const raw = event.target.value.trim();
            if (raw === "") return props.onCommit(null);
            const next = intOrUndefined(raw);
            if (next !== undefined && next >= (props.min ?? 0))
              props.onCommit(next);
          }}
        />
        {props.unit ? (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
            {props.unit}
          </span>
        ) : null}
      </span>
      {props.hint ? <Hint>{props.hint}</Hint> : null}
    </label>
  );
}

function RetryEditor(props: {
  value: RetryPolicyModel | null;
  onChange: (value: RetryPolicyModel | null) => void;
}) {
  const retry = props.value;
  const patch = (partial: Partial<RetryPolicyModel>) =>
    props.onChange({ ...(retry ?? DEFAULT_RETRY), ...partial });
  return (
    <div className="flex flex-col gap-4">
      <Switch
        checked={retry !== null}
        onChange={(checked) => props.onChange(checked ? DEFAULT_RETRY : null)}
        label="Retry when it fails"
        description="Try the step again before failing the run."
      />
      {retry ? (
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Attempts"
            value={retry.maxAttempts}
            min={1}
            onCommit={(next) => {
              if (next !== null) patch({ maxAttempts: next });
            }}
          />
          <label className="block">
            <FieldLabel label="Backoff" />
            <Select
              value={retry.backoff}
              options={[
                { value: "FIXED", label: "Fixed" },
                { value: "EXPONENTIAL", label: "Exponential" },
              ]}
              onChange={(backoff) =>
                patch({ backoff: backoff as RetryPolicyModel["backoff"] })
              }
            />
          </label>
          <NumberField
            label="First delay"
            unit="seconds"
            value={retry.initialDelaySeconds}
            onCommit={(next) => {
              if (next !== null) patch({ initialDelaySeconds: next });
            }}
          />
          <NumberField
            label="Longest delay"
            unit="seconds"
            value={retry.maxDelaySeconds}
            onCommit={(next) => {
              if (next !== null) patch({ maxDelaySeconds: next });
            }}
          />
          <label className="col-span-2 block">
            <FieldLabel label="Retry on" optional />
            <input
              key={`on-${retry.retryOn.join(",")}`}
              className={`${textInputClass} font-mono text-xs`}
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
            <Hint>
              Error classes, comma-separated. Empty retries every error.
            </Hint>
          </label>
        </div>
      ) : null}
    </div>
  );
}

const PORT_LABEL: Record<string, string> = {
  next: "Then",
  true: "When true",
  false: "When false",
};

function EdgeRow(props: {
  target?: StepModel;
  fallback: string;
  onRemove: () => void;
  tone?: "warn";
}) {
  return (
    <div
      className={`flex min-w-0 items-center gap-2 rounded-md border border-solid px-2 py-1.5 text-[13px] ${
        props.tone === "warn"
          ? "border-wf-warn/30 bg-wf-warn/5"
          : "border-foreground/10 bg-muted/40"
      }`}
    >
      <Icon name="arrowRight" className="h-3.5 w-3.5 text-muted-foreground" />
      {props.target ? (
        <BlockLogo blockType={props.target.blockType} size={16} />
      ) : null}
      <span className="min-w-0 flex-1 truncate text-foreground">
        {props.target ? props.target.name || props.target.key : props.fallback}
      </span>
      <IconButton icon="close" label="Disconnect" onClick={props.onRemove} />
    </div>
  );
}

// A port may hold several edges: the engine runs every successor on a taken
// port. acyclicTargets offers any step that is not an ancestor.
function FlowPortEditor(props: {
  step: StepModel;
  model: WorkflowModel;
  callbacks: WorkflowEditorCallbacks;
}) {
  const { step, model, callbacks } = props;
  const ports = flowPorts(step.blockType);
  const attached = model.trigger
    ? reachableFrom(model.trigger.id, model.edges)
    : new Set<string>();
  const candidates = acyclicTargets(model, step.id);
  return (
    <div className="flex flex-col gap-4">
      {ports.map((port) => {
        const edges = model.edges.filter(
          (candidate) => candidate.from === step.id && candidate.port === port,
        );
        const targets = candidates.filter(
          (candidate) => !edges.some((edge) => edge.to === candidate.id),
        );
        return (
          <div key={port}>
            <FieldLabel label={PORT_LABEL[port] ?? port} />
            <div className="flex flex-col gap-1.5">
              {edges.map((edge) => (
                <EdgeRow
                  key={edge.id}
                  target={model.steps.find((entry) => entry.id === edge.to)}
                  fallback={edge.to}
                  onRemove={() => callbacks.removeEdge(edge.id)}
                />
              ))}
              <Select
                value=""
                disabled={targets.length === 0}
                placeholder={
                  targets.length === 0
                    ? "No other step to connect to"
                    : edges.length > 0
                      ? "Also run…"
                      : "Run next…"
                }
                options={targets.map((target) => ({
                  value: target.id,
                  label: target.name || target.key,
                  description: attached.has(target.id)
                    ? undefined
                    : "Not connected to the trigger yet",
                  icon: <BlockLogo blockType={target.blockType} size={16} />,
                }))}
                onChange={(to) => {
                  if (to) callbacks.addEdge({ from: step.id, to, port });
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
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
  const targets = acyclicTargets(model, step.id).filter(
    (candidate) => !errorEdges.some((edge) => edge.to === candidate.id),
  );
  return (
    <div>
      <FieldLabel label="On error, run" optional />
      <div className="flex flex-col gap-1.5">
        {errorEdges.map((edge) => (
          <EdgeRow
            key={edge.id}
            tone="warn"
            target={model.steps.find((entry) => entry.id === edge.to)}
            fallback={edge.to}
            onRemove={() => callbacks.removeEdge(edge.id)}
          />
        ))}
        <Select
          value=""
          disabled={targets.length === 0}
          placeholder={
            targets.length === 0
              ? "No other step to run"
              : errorEdges.length > 0
                ? "Also run…"
                : "Fail the run"
          }
          options={targets.map((target) => ({
            value: target.id,
            label: target.name || target.key,
            icon: <BlockLogo blockType={target.blockType} size={16} />,
          }))}
          onChange={(to) => {
            if (to) callbacks.addEdge({ from: step.id, to, port: "error" });
          }}
        />
      </div>
      <Hint>Route failures to another step instead of failing the run.</Hint>
    </div>
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
    <div className="group/field">
      <FieldLabel
        label="Idempotency key"
        optional
        action={
          <ExpressionPickerButton
            active={field.active}
            onFocusField={field.focus}
          />
        }
      />
      <input
        ref={ref}
        key={`${step.id}-idem`}
        aria-label="Idempotency key"
        className={`${textInputClass} font-mono text-xs`}
        defaultValue={step.idempotencyKeyExpression ?? ""}
        placeholder="{{trigger.payload.id}}"
        spellCheck={false}
        onFocus={field.focus}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => commit(event.target.value)}
      />
      <ExpressionTokenLine value={draft} />
      <Hint>Two runs with the same key count as one side effect.</Hint>
    </div>
  );
}

// Steps are referenced by key in expressions, so it must stay a clean slug.
function KeyField(props: {
  step: StepModel;
  callbacks: WorkflowEditorCallbacks;
}) {
  const { step, callbacks } = props;
  const [copied, setCopied] = useState(false);
  const id = useId();
  return (
    <div>
      <FieldLabel
        htmlFor={id}
        label="Key"
        action={
          <IconButton
            icon={copied ? "check" : "copy"}
            label="Copy reference"
            onClick={(event) => {
              event.preventDefault();
              navigator.clipboard.writeText(`{{${step.key}}}`).then(
                () => setCopied(true),
                () => undefined,
              );
            }}
          />
        }
      />
      <input
        id={id}
        key={`${step.id}-key-${step.key}`}
        className={`${textInputClass} font-mono text-xs`}
        defaultValue={step.key}
        spellCheck={false}
        onBlur={(event) => {
          const key = event.target.value.trim();
          if (key && key !== step.key)
            callbacks.updateStep({ id: step.id, key });
          else event.target.value = step.key;
        }}
      />
      <Hint>
        Later steps read this step&apos;s output as{" "}
        <code className="rounded bg-muted px-1 font-mono text-[11px] text-foreground">
          {`{{${step.key}.…}}`}
        </code>
        . Renaming it doesn&apos;t update expressions that use it.
      </Hint>
    </div>
  );
}

function StepSettings(props: {
  step: StepModel;
  model: WorkflowModel;
  callbacks: WorkflowEditorCallbacks;
  onRemoved: () => void;
}) {
  const { step, callbacks } = props;
  return (
    <div className="flex flex-col gap-6">
      <Section title="Identity">
        <KeyField step={step} callbacks={callbacks} />
      </Section>
      <Section
        title="What runs next"
        description="Any step that isn't upstream of this one."
      >
        <FlowPortEditor step={step} model={props.model} callbacks={callbacks} />
      </Section>
      <Section title="When it fails">
        <ErrorPortEditor
          step={step}
          model={props.model}
          callbacks={callbacks}
        />
        <NumberField
          label="Timeout"
          unit="seconds"
          min={1}
          value={step.timeoutSeconds}
          placeholder="Runtime default"
          onCommit={(next) => {
            if (next === 0) return;
            if (next !== step.timeoutSeconds)
              callbacks.updateStep({ id: step.id, timeoutSeconds: next });
          }}
        />
        {/* Stored on the step, but the runtime does not enforce them yet. */}
        <fieldset
          disabled
          className="m-0 flex min-w-0 flex-col gap-4 rounded-lg border border-dashed border-foreground/15 p-3"
        >
          <legend className="px-1">
            <AvailableSoon>retries and idempotency</AvailableSoon>
          </legend>
          <div className="flex flex-col gap-4 opacity-70">
            <RetryEditor
              value={step.retry}
              onChange={(retry) => callbacks.updateStep({ id: step.id, retry })}
            />
            <IdempotencyField step={step} callbacks={callbacks} />
          </div>
        </fieldset>
      </Section>
      <Section
        title="Configuration as JSON"
        description="Everything the setup form stores, for pasting or bulk edits."
      >
        <RawConfigEditor
          value={step.config}
          onApply={(config) => callbacks.updateStep({ id: step.id, config })}
        />
      </Section>
      <Section title="Remove">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Removes the step and its connections.
          </p>
          <Button
            variant="danger"
            onClick={() => {
              callbacks.removeStep(step.id);
              props.onRemoved();
            }}
          >
            <Icon name="trash" className="h-3.5 w-3.5" />
            Remove step
          </Button>
        </div>
      </Section>
    </div>
  );
}

function useLatestRun(designTime?: DesignTimeService) {
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "ready"; run: LatestRun | null }
  >({ kind: "loading" });
  useEffect(() => {
    if (!designTime?.latestRun) return;
    let alive = true;
    designTime.latestRun().then(
      (run) => {
        if (alive) setState({ kind: "ready", run });
      },
      () => {
        if (alive) setState({ kind: "ready", run: null });
      },
    );
    return () => {
      alive = false;
    };
  }, [designTime]);
  return designTime?.latestRun ? state : null;
}

const RUN_TEXT: Record<string, string> = {
  SUCCEEDED: "text-wf-ok",
  FAILED: "text-wf-fail",
  SKIPPED: "text-muted-foreground",
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

// What this step (or the trigger) saw in the workflow's most recent run.
function LastRunSection(props: {
  designTime?: DesignTimeService;
  stepKey?: string;
  latest?: ReturnType<typeof useLatestRun>;
  bare?: boolean;
}) {
  const own = useLatestRun(
    props.latest === undefined ? props.designTime : undefined,
  );
  const latest = props.latest ?? own;
  if (!latest) return null;
  const run = latest.kind === "ready" ? latest.run : null;
  const step = props.stepKey
    ? run?.steps.find((entry) => entry.stepKey === props.stepKey)
    : undefined;
  const status = props.stepKey ? step?.status : run ? "FIRED" : undefined;
  const body = (
    <>
      {latest.kind === "loading" ? (
        <div className="h-16 animate-pulse rounded-md bg-foreground/5" />
      ) : !run ? (
        <p className="text-xs text-muted-foreground">
          No runs yet. Once the workflow runs, what this{" "}
          {props.stepKey ? "step receives and produces" : "trigger hands on"}{" "}
          shows up here.
        </p>
      ) : props.stepKey && !step ? (
        <p className="text-xs text-muted-foreground">
          The last run, {relativeTime(run.startedAt)}, didn&apos;t reach this
          step.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            <span
              className={`font-medium ${RUN_TEXT[status ?? ""] ?? "text-wf-ok"}`}
            >
              {status === "FIRED"
                ? "Fired"
                : (status ?? "").charAt(0) +
                  (status ?? "").slice(1).toLowerCase()}
            </span>{" "}
            {relativeTime(run.startedAt)}
          </p>
          {step?.error ? (
            <pre className="overflow-auto whitespace-pre-wrap rounded-md bg-wf-fail/10 p-2.5 text-xs text-wf-fail">
              {step.error}
            </pre>
          ) : null}
          {step ? (
            <>
              <DataViewer label="Received" value={step.input} />
              <DataViewer
                label="Produced"
                value={step.output}
                root={`steps.${props.stepKey}.output`}
              />
            </>
          ) : (
            <DataViewer
              label="Payload"
              value={run.triggerPayload}
              root="trigger.payload"
            />
          )}
        </div>
      )}
    </>
  );
  return props.bare ? (
    <div className="flex flex-col gap-4">{body}</div>
  ) : (
    <Section title="Last run">{body}</Section>
  );
}

type StepTab = "setup" | "run" | "settings";

function settingsCustomised(step: StepModel, model: WorkflowModel): number {
  return [
    step.retry !== null,
    step.timeoutSeconds !== null,
    step.idempotencyKeyExpression !== null,
    model.edges.some((edge) => edge.from === step.id && edge.port === "error"),
  ].filter(Boolean).length;
}

export function StepPanel(props: {
  step: StepModel;
  model: WorkflowModel;
  callbacks: WorkflowEditorCallbacks;
  onClose: () => void;
  onSelect?: (id: string) => void;
  designTime?: DesignTimeService;
}) {
  const { step, callbacks } = props;
  const [tab, setTab] = useState<StepTab>("setup");
  const meta = useBlockMeta(step.blockType);
  const { form, error: formError } = useBlockForm(
    step.blockType,
    props.designTime,
  );
  const missing = missingForBlock(form, step.config, step.connectionId);
  const customised = settingsCustomised(step, props.model);
  const latest = useLatestRun(props.designTime);
  const lastStatus =
    latest?.kind === "ready"
      ? latest.run?.steps.find((entry) => entry.stepKey === step.key)?.status
      : undefined;
  const order = flowOrder(props.model);
  const index = order.indexOf(step.id);
  const select = props.onSelect;
  const position =
    select && index >= 0
      ? {
          index,
          total: order.length,
          onPrevious: index > 0 ? () => select(order[index - 1]) : undefined,
          onNext:
            index < order.length - 1
              ? () => select(order[index + 1])
              : undefined,
        }
      : undefined;
  return (
    <div className="flex min-h-full flex-col">
      <PanelHeader
        blockType={step.blockType}
        name={step.name || step.key}
        onRename={(name) => callbacks.updateStep({ id: step.id, name })}
        actionLabel={
          form && form !== "loading" && form.title
            ? form.title
            : [meta.subtitle, meta.displayName].filter(Boolean).join(": ")
        }
        missing={missing}
        loading={form === "loading"}
        onClose={props.onClose}
        position={position}
      >
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "setup", label: "Setup" },
            ...(latest
              ? [
                  {
                    value: "run" as const,
                    label: "Last run",
                    badge: lastStatus ? (
                      <span
                        aria-label={lastStatus.toLowerCase()}
                        className={`h-1.5 w-1.5 rounded-full ${
                          lastStatus === "SUCCEEDED"
                            ? "bg-wf-ok"
                            : lastStatus === "FAILED"
                              ? "bg-wf-fail"
                              : "bg-foreground/30"
                        }`}
                      />
                    ) : undefined,
                  },
                ]
              : []),
            {
              value: "settings",
              label: "Settings",
              badge:
                customised > 0 ? (
                  <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">
                    {customised}
                  </span>
                ) : undefined,
            },
          ]}
        />
      </PanelHeader>
      <div className="flex-1 px-4 py-5">
        {tab === "setup" ? (
          <div className="flex flex-col gap-5">
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
              formError={formError}
              config={step.config}
              onChange={(config) =>
                callbacks.updateStep({ id: step.id, config })
              }
              designTime={props.designTime}
              connectionId={step.connectionId ?? undefined}
              scopeStepId={step.id}
            />
          </div>
        ) : tab === "run" ? (
          <LastRunSection
            designTime={props.designTime}
            stepKey={step.key}
            latest={latest}
            bare
          />
        ) : (
          <StepSettings
            step={step}
            model={props.model}
            callbacks={callbacks}
            onRemoved={props.onClose}
          />
        )}
      </div>
    </div>
  );
}

function TestTriggerSection(props: { onTest: () => Promise<unknown> }) {
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "done"; result: string; failed: boolean }
  >({ kind: "idle" });
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Fetch sample data to see what this trigger hands the next steps.
        </p>
        <Button
          size="sm"
          disabled={state.kind === "loading"}
          onClick={() => {
            setState({ kind: "loading" });
            props.onTest().then(
              (result) =>
                setState({
                  kind: "done",
                  result: JSON.stringify(result, null, 2),
                  failed: false,
                }),
              (error: unknown) =>
                setState({
                  kind: "done",
                  result:
                    error instanceof Error ? error.message : String(error),
                  failed: true,
                }),
            );
          }}
        >
          <Icon name="play" className="h-3.5 w-3.5" />
          {state.kind === "loading" ? "Testing…" : "Test trigger"}
        </Button>
      </div>
      {state.kind === "done" ? (
        <pre
          className={`mt-3 max-h-56 overflow-auto rounded-md p-2 text-xs ${
            state.failed
              ? "bg-wf-fail/10 text-wf-fail"
              : "bg-muted text-foreground"
          }`}
        >
          {state.result}
        </pre>
      ) : null}
    </div>
  );
}

type EndpointState =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "ready"; endpoint: WebhookEndpoint };

// Loaded once in the panel: the URL box shows it and a piece's setup markdown
// substitutes it, and two fetches would mint against two reads of `armed`.
function useWebhookEndpoint(
  load: (() => Promise<WebhookEndpoint | null>) | undefined,
): EndpointState {
  const [state, setState] = useState<EndpointState>({ kind: "loading" });

  useEffect(() => {
    if (!load) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks-extra/set-state-in-effect -- marks the load that starts on this very line
    setState({ kind: "loading" });
    load().then(
      (endpoint) => {
        if (cancelled) return;
        setState(endpoint ? { kind: "ready", endpoint } : { kind: "empty" });
      },
      (error: unknown) => {
        if (cancelled) return;
        setState({
          kind: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [load]);

  return state;
}

// The endpoint URL is the whole credential, so it is read from the runtime
// rather than derived here, and only exists once the workflow is enabled.
function WebhookUrlSection(props: { state: EndpointState }) {
  const [copied, setCopied] = useState(false);
  const state = props.state;

  return (
    <div>
      <FieldLabel label="Endpoint URL" />
      {state.kind === "loading" ? (
        <div className="h-9 animate-pulse rounded-md bg-foreground/5" />
      ) : null}
      {state.kind === "empty" ? (
        <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          Enable the workflow to create its endpoint.
        </p>
      ) : null}
      {state.kind === "error" ? (
        <p className="text-xs text-wf-fail">{state.message}</p>
      ) : null}
      {state.kind === "ready" ? (
        <>
          <div className="flex items-center gap-1.5">
            <input
              readOnly
              aria-label="Endpoint URL"
              className={`${textInputClass} bg-muted/50 font-mono text-xs`}
              value={state.endpoint.url}
              onFocus={(event) => event.currentTarget.select()}
            />
            <Button
              onClick={() => {
                navigator.clipboard.writeText(state.endpoint.url).then(
                  () => setCopied(true),
                  () => undefined,
                );
              }}
            >
              <Icon name={copied ? "check" : "copy"} className="h-3.5 w-3.5" />
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          {!state.endpoint.armed ? (
            <p className="mt-2 rounded-md bg-wf-warn/10 px-3 py-2 text-xs text-wf-warn">
              Not accepting deliveries: the workflow is disabled or its webhook
              config is invalid.
            </p>
          ) : null}
          {!state.endpoint.absoluteUrl ? (
            <p className="mt-2 rounded-md bg-wf-warn/10 px-3 py-2 text-xs text-wf-warn">
              This reactor doesn&apos;t know its public address, so the URL is
              missing its host. Prefix it with the host the provider can reach.
            </p>
          ) : null}
          <Hint>
            Treat this URL as a secret: anyone who has it can call the endpoint.
          </Hint>
        </>
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
  const meta = useBlockMeta(trigger.blockType);
  const isPieceTrigger = trigger.blockType.includes("#trigger:");
  const { form, error: formError } = useBlockForm(
    trigger.blockType,
    props.designTime,
  );
  // core#webhook, and any piece trigger the provider pushes to: both are
  // reached through this workflow's endpoint URL.
  const isWebhookTrigger =
    trigger.blockType === "core#webhook" ||
    (form !== "loading" && form?.triggerStrategy === "WEBHOOK");
  // Only a webhook trigger asks. The query mints on first ask, so opening
  // this panel on a schedule or document trigger must not create an endpoint.
  const endpoint = useWebhookEndpoint(
    isWebhookTrigger ? props.designTime?.webhookEndpoint : undefined,
  );
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
    <div className="flex min-h-full flex-col">
      <PanelHeader
        blockType={trigger.blockType}
        name={
          form && form !== "loading" && form.title
            ? form.title
            : meta.displayName
        }
        actionLabel={describeTrigger(trigger)}
        missing={missing}
        loading={form === "loading"}
        onClose={props.onClose}
      />
      <div className="flex flex-1 flex-col gap-6 px-4 py-5">
        {isWebhookTrigger && props.designTime?.webhookEndpoint ? (
          <WebhookUrlSection state={endpoint} />
        ) : null}
        {isPieceTrigger ? (
          <ConnectionField
            key={`${trigger.id}-conn`}
            blockType={trigger.blockType}
            value={trigger.connectionId ?? ""}
            onChange={(connectionId) => setTrigger({ connectionId })}
            designTime={props.designTime}
          />
        ) : null}
        {trigger.blockType === "core#schedule" ? (
          <ScheduleBuilder
            key={trigger.id}
            config={trigger.config}
            onChange={(config) => setTrigger({ config })}
          />
        ) : (
          <ConfigSection
            key={trigger.id}
            blockType={trigger.blockType}
            form={form}
            formError={formError}
            config={trigger.config}
            onChange={(config) => setTrigger({ config })}
            designTime={props.designTime}
            connectionId={trigger.connectionId ?? undefined}
            webhookUrl={
              endpoint.kind === "ready" ? endpoint.endpoint.url : undefined
            }
          />
        )}
        <LastRunSection designTime={props.designTime} />
        {isPieceTrigger && props.designTime?.testTrigger ? (
          <Section title="Try it">
            <TestTriggerSection onTest={props.designTime.testTrigger} />
          </Section>
        ) : null}
        <Section title="Remove">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Without a trigger the workflow never starts.
            </p>
            <Button
              variant="danger"
              onClick={() => {
                callbacks.clearTrigger();
                props.onClose();
              }}
            >
              <Icon name="trash" className="h-3.5 w-3.5" />
              Remove trigger
            </Button>
          </div>
        </Section>
      </div>
    </div>
  );
}
