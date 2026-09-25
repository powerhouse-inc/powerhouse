// List editor for document actions: action types come from the target
// document model, and picking one prefills its input from the schema.
import { useState } from "react";
import { inputTemplateFromSchema } from "./action-template.js";
import { AutocompleteInput } from "./Autocomplete.js";

interface ActionRow {
  type: string;
  input: unknown;
}

function toRows(value: unknown): ActionRow[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const record = (entry ?? {}) as Record<string, unknown>;
    return {
      type: typeof record.type === "string" ? record.type : "",
      input: record.input ?? {},
    };
  });
}

function stringifyInput(input: unknown): string {
  try {
    return JSON.stringify(input ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

const INVALID = Symbol("invalid");

function parseInput(text: string): unknown {
  if (text.trim() === "") return {};
  try {
    return JSON.parse(text);
  } catch {
    return INVALID;
  }
}

const inputClass =
  "w-full rounded border border-foreground/15 px-2 py-1.5 text-sm text-foreground";

function ActionRowEditor(props: {
  row: ActionRow;
  onChange: (row: ActionRow) => void;
  onRemove: () => void;
  loadActionTypes?: () => Promise<unknown>;
}) {
  const { row } = props;
  const [jsonText, setJsonText] = useState(() => stringifyInput(row.input));
  const [prevInput, setPrevInput] = useState(row.input);
  if (row.input !== prevInput) {
    setPrevInput(row.input);
    setJsonText(stringifyInput(row.input));
  }
  const [jsonError, setJsonError] = useState<string | null>(null);

  return (
    <div className="rounded border border-foreground/10 p-2">
      <div className="flex items-start gap-1">
        <div className="grow">
          <AutocompleteInput
            className={`${inputClass} font-mono text-xs`}
            value={row.type}
            placeholder="Action type"
            loadOptions={props.loadActionTypes}
            onCommit={(type) => props.onChange({ ...row, type })}
            onPick={(option) => {
              const empty =
                row.input === null ||
                row.input === undefined ||
                (typeof row.input === "object" &&
                  Object.keys(row.input).length === 0);
              const template = option.inputSchema
                ? inputTemplateFromSchema(option.inputSchema, option.value)
                : null;
              props.onChange({
                type: option.value,
                input: empty && template ? template : row.input,
              });
            }}
          />
        </div>
        <button
          type="button"
          className="shrink-0 rounded border border-foreground/10 px-2 py-1 text-xs text-muted-foreground/80 hover:text-wf-fail"
          onClick={props.onRemove}
          title="Remove action"
        >
          ✕
        </button>
      </div>
      <textarea
        className={`${inputClass} mt-1 min-h-16 font-mono text-xs`}
        value={jsonText}
        spellCheck={false}
        onChange={(event) => setJsonText(event.target.value)}
        onBlur={() => {
          const input = parseInput(jsonText);
          if (input === INVALID) {
            setJsonError("Invalid JSON — input not saved");
            return;
          }
          props.onChange({ ...row, input });
          setJsonError(null);
        }}
      />
      {jsonError ? (
        <p className="mt-0.5 text-[11px] text-wf-fail">{jsonError}</p>
      ) : null}
    </div>
  );
}

export function ActionListEditor(props: {
  value: unknown;
  onCommit: (value: unknown) => void;
  loadActionTypes?: () => Promise<unknown>;
}) {
  const rows = toRows(props.value);
  const commit = (next: ActionRow[]) => {
    props.onCommit(next.length > 0 ? next : undefined);
  };
  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, index) => (
        <ActionRowEditor
          key={index}
          row={row}
          loadActionTypes={props.loadActionTypes}
          onChange={(next) =>
            commit(rows.map((entry, i) => (i === index ? next : entry)))
          }
          onRemove={() => commit(rows.filter((_, i) => i !== index))}
        />
      ))}
      <button
        type="button"
        className="self-start rounded border border-foreground/15 px-2 py-1 text-xs font-medium text-muted-foreground"
        onClick={() => commit([...rows, { type: "", input: {} }])}
      >
        + Add action
      </button>
    </div>
  );
}
