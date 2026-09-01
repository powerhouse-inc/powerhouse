import { useState } from "react";
import type {
  StepModel,
  TriggerModel,
  WorkflowEditorCallbacks,
} from "./model.js";

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

function ConfigEditor(props: {
  value: unknown;
  onApply: (config: unknown) => void;
}) {
  const [text, setText] = useState(() => stringify(props.value));
  const [error, setError] = useState<string | null>(null);
  return (
    <Field label="Config (JSON)">
      <textarea
        className={`${inputClass} min-h-36 font-mono text-xs`}
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
        Apply config
      </button>
    </Field>
  );
}

export function StepPanel(props: {
  step: StepModel;
  callbacks: WorkflowEditorCallbacks;
  onClose: () => void;
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
      <Field label="Block type">
        <input
          key={`${step.id}-block`}
          className={`${inputClass} font-mono text-xs`}
          defaultValue={step.blockType}
          onBlur={(event) => {
            const blockType = event.target.value.trim();
            if (blockType && blockType !== step.blockType)
              callbacks.updateStep({ id: step.id, blockType });
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
      <ConfigEditor
        key={`${step.id}-config`}
        value={step.config}
        onApply={(config) => callbacks.updateStep({ id: step.id, config })}
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
      <ConfigEditor
        key={trigger.id}
        value={trigger.config}
        onApply={(config) =>
          callbacks.setTrigger({ blockType: trigger.blockType, config })
        }
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
