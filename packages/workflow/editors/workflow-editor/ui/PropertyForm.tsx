// Property-driven config form, modeled on the Activepieces piece-properties
// panel: one control per prop, typed by the descriptor.
import { useRef, useState } from "react";
import { ActionListEditor } from "./ActionListEditor.js";
import { AutocompleteInput } from "./Autocomplete.js";
import { ExpressionPickerButton } from "./ExpressionPicker.js";
import type { BlockFormProp } from "./forms.js";

// Splices text at the field's cursor and returns the updated value.
function insertAtCursor(
  element: HTMLInputElement | HTMLTextAreaElement,
  text: string,
): string {
  const start = element.selectionStart ?? element.value.length;
  const end = element.selectionEnd ?? start;
  element.value =
    element.value.slice(0, start) + text + element.value.slice(end);
  return element.value;
}

const inputClass =
  "w-full rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-800";

interface DropdownState {
  options: { label: string; value: unknown }[];
  placeholder?: string;
  error?: string;
  loading: boolean;
}

function parseDropdownResult(result: unknown): DropdownState {
  const record = result as {
    options?: { label?: unknown; value?: unknown }[];
    placeholder?: string;
  } | null;
  if (!record || !Array.isArray(record.options)) {
    return { options: [], error: "Unexpected options result", loading: false };
  }
  return {
    options: record.options.map((option) => ({
      label: stringifyValue(option.label ?? option.value),
      value: option.value,
    })),
    placeholder: record.placeholder,
    loading: false,
  };
}

function stringifyValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value as number | boolean);
  }
}

function PropField(props: {
  prop: BlockFormProp;
  value: unknown;
  onCommit: (value: unknown) => void;
  loadOptions?: (propName: string) => Promise<unknown>;
  scopeStepId?: string;
}) {
  const { prop, value, onCommit } = props;
  const [dropdown, setDropdown] = useState<DropdownState | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const fieldRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  // JSON-ish fields only splice the text; their blur handler parses/commits.
  const pickerFor = (commitAfter: boolean) => (
    <ExpressionPickerButton
      stepId={props.scopeStepId}
      onPick={(expression) => {
        if (!fieldRef.current) return;
        const next = insertAtCursor(fieldRef.current, expression);
        if (commitAfter) onCommit(next);
      }}
    />
  );

  const label = (
    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
      {prop.displayName}
      {prop.required ? <span className="text-red-500"> *</span> : null}
    </span>
  );
  const hint = prop.description ? (
    <p className="mt-0.5 text-[11px] text-slate-400">{prop.description}</p>
  ) : null;

  switch (prop.type) {
    case "PH_AUTOCOMPLETE":
      return (
        <label className="block">
          {label}
          <AutocompleteInput
            value={typeof value === "string" ? value : stringifyValue(value)}
            onCommit={(next) => onCommit(next === "" ? undefined : next)}
            loadOptions={
              props.loadOptions
                ? () => props.loadOptions!(prop.name)
                : undefined
            }
          />
          {hint}
        </label>
      );
    case "PH_ACTIONS":
      return (
        <div>
          {label}
          <ActionListEditor
            value={value}
            onCommit={onCommit}
            loadActionTypes={
              props.loadOptions
                ? () => props.loadOptions!("actionType")
                : undefined
            }
          />
          {hint}
        </div>
      );
    case "MARKDOWN":
      return (
        <p className="rounded bg-slate-100 px-2 py-1.5 text-xs text-slate-500">
          {stringifyValue(
            prop.defaultValue ?? prop.description ?? prop.displayName,
          )}
        </p>
      );
    case "CHECKBOX":
      return (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(event) => onCommit(event.target.checked)}
          />
          {prop.displayName}
        </label>
      );
    case "NUMBER":
      return (
        <label className="block">
          {label}
          <input
            type="number"
            className={inputClass}
            defaultValue={typeof value === "number" ? value : ""}
            onBlur={(event) => {
              const raw = event.target.value.trim();
              onCommit(raw === "" ? undefined : Number(raw));
            }}
          />
          {hint}
        </label>
      );
    case "STATIC_DROPDOWN":
    case "STATIC_MULTI_SELECT_DROPDOWN":
      return (
        <label className="block">
          {label}
          <select
            className={inputClass}
            value={stringifyValue(value)}
            onChange={(event) => {
              const picked = prop.staticOptions?.find(
                (option) => stringifyValue(option.value) === event.target.value,
              );
              onCommit(picked ? picked.value : event.target.value);
            }}
          >
            <option value="">—</option>
            {(prop.staticOptions ?? []).map((option) => (
              <option
                key={stringifyValue(option.value)}
                value={stringifyValue(option.value)}
              >
                {option.label}
              </option>
            ))}
          </select>
          {hint}
        </label>
      );
    case "DROPDOWN":
    case "MULTI_SELECT_DROPDOWN":
      return (
        <label className="block">
          {label}
          <div className="flex gap-1">
            <select
              className={inputClass}
              value={stringifyValue(value)}
              onChange={(event) => {
                const picked = dropdown?.options.find(
                  (option) =>
                    stringifyValue(option.value) === event.target.value,
                );
                onCommit(picked ? picked.value : event.target.value);
              }}
            >
              <option value="">
                {stringifyValue(value) || dropdown?.placeholder || "—"}
              </option>
              {(dropdown?.options ?? []).map((option) => (
                <option
                  key={stringifyValue(option.value)}
                  value={stringifyValue(option.value)}
                >
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="shrink-0 rounded border border-slate-300 px-2 text-xs text-slate-600"
              onClick={() => {
                setDropdown({ options: [], loading: true });
                props
                  .loadOptions?.(prop.name)
                  .then((result) => setDropdown(parseDropdownResult(result)))
                  .catch((error: unknown) =>
                    setDropdown({
                      options: [],
                      loading: false,
                      error:
                        error instanceof Error ? error.message : String(error),
                    }),
                  );
              }}
            >
              {dropdown?.loading ? "…" : "Load"}
            </button>
          </div>
          {dropdown?.error ? (
            <p className="mt-0.5 text-[11px] text-red-500">{dropdown.error}</p>
          ) : null}
          {hint}
        </label>
      );
    case "LONG_TEXT":
    case "JSON":
    case "OBJECT":
    case "ARRAY":
    case "DYNAMIC": {
      const isText = prop.type === "LONG_TEXT";
      return (
        <label className="block">
          <span className="flex items-end justify-between gap-1">
            {label}
            {pickerFor(isText)}
          </span>
          <textarea
            ref={fieldRef as React.RefObject<HTMLTextAreaElement>}
            className={`${inputClass} min-h-20 ${isText ? "" : "font-mono text-xs"}`}
            defaultValue={
              isText ? stringifyValue(value) : stringifyValue(value)
            }
            spellCheck={false}
            onBlur={(event) => {
              const raw = event.target.value;
              if (isText) {
                onCommit(raw);
                return;
              }
              if (raw.trim() === "") {
                onCommit(undefined);
                setJsonError(null);
                return;
              }
              try {
                onCommit(JSON.parse(raw));
                setJsonError(null);
              } catch {
                setJsonError("Invalid JSON — value not saved");
              }
            }}
          />
          {jsonError ? (
            <p className="mt-0.5 text-[11px] text-red-500">{jsonError}</p>
          ) : null}
          {hint}
        </label>
      );
    }
    default:
      return (
        <label className="block">
          {label}
          <div className="flex items-center gap-1">
            <input
              ref={fieldRef as React.RefObject<HTMLInputElement>}
              className={inputClass}
              defaultValue={
                typeof value === "string" ? value : stringifyValue(value)
              }
              onBlur={(event) => onCommit(event.target.value)}
            />
            {pickerFor(true)}
          </div>
          {hint}
        </label>
      );
  }
}

export function PropertyForm(props: {
  props: BlockFormProp[];
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  loadOptions?: (
    propName: string,
    current: Record<string, unknown>,
  ) => Promise<unknown>;
  // Step whose config is being edited; scopes the expression picker.
  scopeStepId?: string;
}) {
  // Track the latest committed config so sequential field edits accumulate;
  // derive-during-render resets it when the document value changes.
  const [current, setCurrent] = useState(props.value);
  const [prevValue, setPrevValue] = useState(props.value);
  if (props.value !== prevValue) {
    setPrevValue(props.value);
    setCurrent(props.value);
  }

  const commitField = (name: string, value: unknown) => {
    const next = { ...current };
    if (value === undefined) delete next[name];
    else next[name] = value;
    setCurrent(next);
    props.onChange(next);
  };

  return (
    <div className="flex flex-col gap-3">
      {props.props.map((prop) => (
        <PropField
          key={prop.name}
          prop={prop}
          value={current[prop.name] ?? prop.defaultValue}
          onCommit={(value) => commitField(prop.name, value)}
          loadOptions={
            props.loadOptions
              ? (propName) => props.loadOptions!(propName, current)
              : undefined
          }
          scopeStepId={props.scopeStepId}
        />
      ))}
    </div>
  );
}
