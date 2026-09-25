// Workflow-level variables: name/value rows exposed to expressions as
// {{variables.<name>}}. Values are JSON when they parse, strings otherwise.
import { useState } from "react";
import type { VariableModel, WorkflowEditorCallbacks } from "./model.js";

const inputClass =
  "w-full rounded border border-foreground/15 px-2 py-1.5 text-sm text-foreground";

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function stringifyValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value as number | boolean);
  }
}

// Numbers, booleans, objects and arrays typed as JSON become values; the
// rest stays text so "007" or a URL never gets mangled.
export function parseVariableValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (/^(-?\d+(\.\d+)?|true|false|null|[[{"])/.test(trimmed)) {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return raw;
    }
  }
  return raw;
}

function VariableRow(props: {
  variable: VariableModel;
  callbacks: WorkflowEditorCallbacks;
}) {
  const { variable, callbacks } = props;
  return (
    <div className="flex items-start gap-1">
      <input
        key={`${variable.id}-key`}
        className={`${inputClass} w-2/5 font-mono text-xs`}
        defaultValue={variable.key}
        readOnly
        title="Keys are fixed once created; remove and re-add to rename"
      />
      <input
        key={`${variable.id}-value-${stringifyValue(variable.value)}`}
        className={`${inputClass} font-mono text-xs`}
        defaultValue={stringifyValue(variable.value)}
        placeholder="value"
        spellCheck={false}
        onBlur={(event) => {
          const next = parseVariableValue(event.target.value);
          if (stringifyValue(next) !== stringifyValue(variable.value)) {
            callbacks.setVariable({
              id: variable.id,
              key: variable.key,
              value: next,
            });
          }
        }}
      />
      <button
        type="button"
        className="mt-1.5 shrink-0 text-[11px] text-wf-fail"
        title="Remove variable"
        onClick={() => callbacks.removeVariable(variable.id)}
      >
        ✕
      </button>
    </div>
  );
}

export function VariablesEditor(props: {
  variables: VariableModel[];
  callbacks: WorkflowEditorCallbacks;
  onClose: () => void;
}) {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const trimmedKey = key.trim();
  const keyError =
    trimmedKey === ""
      ? null
      : !KEY_PATTERN.test(trimmedKey)
        ? "Letters, digits and _ only; must not start with a digit"
        : props.variables.some((variable) => variable.key === trimmedKey)
          ? "A variable with this name already exists"
          : null;
  const canAdd = trimmedKey !== "" && keyError === null;
  const add = () => {
    if (!canAdd) return;
    props.callbacks.setVariable({
      key: trimmedKey,
      value: parseVariableValue(value),
    });
    setKey("");
    setValue("");
  };

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Variables</h3>
        <button
          type="button"
          className="text-xs text-muted-foreground/80"
          onClick={props.onClose}
        >
          Close
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground/80">
        Reference a variable in any step field as{" "}
        <code className="font-mono">{"{{variables.name}}"}</code>.
      </p>
      {props.variables.length === 0 ? (
        <p className="text-xs text-muted-foreground/80">No variables yet.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {props.variables.map((variable) => (
            <VariableRow
              key={variable.id}
              variable={variable}
              callbacks={props.callbacks}
            />
          ))}
        </div>
      )}
      <div className="rounded border border-foreground/10 bg-card p-2">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
          Add variable
        </div>
        <div className="flex items-start gap-1">
          <input
            className={`${inputClass} w-2/5 font-mono text-xs`}
            placeholder="name"
            value={key}
            spellCheck={false}
            onChange={(event) => setKey(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") add();
            }}
          />
          <input
            className={`${inputClass} font-mono text-xs`}
            placeholder="value"
            value={value}
            spellCheck={false}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") add();
            }}
          />
          <button
            type="button"
            className="mt-0.5 shrink-0 rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-40"
            disabled={!canAdd}
            onClick={add}
          >
            Add
          </button>
        </div>
        {keyError ? (
          <p className="mt-1 text-[11px] text-wf-fail">{keyError}</p>
        ) : null}
      </div>
    </div>
  );
}
