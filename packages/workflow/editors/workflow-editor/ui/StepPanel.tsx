import { useEffect, useState } from "react";
import type { BlockForm, DesignTimeService } from "./forms.js";
import type {
  StepModel,
  TriggerModel,
  WorkflowEditorCallbacks,
} from "./model.js";
import { PropertyForm } from "./PropertyForm.js";

function stringify(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {props.label}
      </span>
      {props.children}
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
  config: unknown;
  onChange: (config: unknown) => void;
  designTime?: DesignTimeService;
}) {
  const form = useBlockForm(props.blockType, props.designTime);
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
          loadOptions={
            props.designTime
              ? (propName, current) =>
                  props.designTime!.loadOptions(
                    props.blockType,
                    propName,
                    current,
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
          Advanced: edit raw JSON
        </summary>
        <div className="mt-2">
          <RawConfigEditor value={props.config} onApply={props.onChange} />
        </div>
      </details>
    </div>
  );
}

export function StepPanel(props: {
  step: StepModel;
  callbacks: WorkflowEditorCallbacks;
  onClose: () => void;
  designTime?: DesignTimeService;
}) {
  const { step, callbacks } = props;
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Step</h3>
        <button
          type="button"
          className="text-xs text-slate-400"
          onClick={props.onClose}
        >
          Close
        </button>
      </div>
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
      <Field label="Connection id (optional)">
        <input
          key={`${step.id}-conn`}
          className={`${inputClass} font-mono text-xs`}
          defaultValue={step.connectionId ?? ""}
          placeholder="powerhouse/connection document id"
          onBlur={(event) => {
            const connectionId = event.target.value.trim();
            if (connectionId && connectionId !== step.connectionId)
              callbacks.updateStep({ id: step.id, connectionId });
          }}
        />
      </Field>
      <ConfigSection
        key={`${step.id}-config`}
        blockType={step.blockType}
        config={step.config}
        onChange={(config) => callbacks.updateStep({ id: step.id, config })}
        designTime={props.designTime}
      />
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

export function TriggerPanel(props: {
  trigger: TriggerModel;
  callbacks: WorkflowEditorCallbacks;
  onClose: () => void;
  designTime?: DesignTimeService;
}) {
  const { trigger, callbacks } = props;
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Trigger</h3>
        <button
          type="button"
          className="text-xs text-slate-400"
          onClick={props.onClose}
        >
          Close
        </button>
      </div>
      <Field label="Block type">
        <input
          className={`${inputClass} font-mono text-xs`}
          value={trigger.blockType}
          readOnly
        />
      </Field>
      <ConfigSection
        key={trigger.id}
        blockType={trigger.blockType}
        config={trigger.config}
        onChange={(config) =>
          callbacks.setTrigger({ blockType: trigger.blockType, config })
        }
        designTime={props.designTime}
      />
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
