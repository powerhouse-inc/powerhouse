// Text input with reactor-backed suggestions (datalist); free text stays
// allowed so expression values like {{steps.x.output.id}} still work.
import { useId, useState } from "react";

export interface AutocompleteOption {
  label: string;
  value: string;
  inputSchema?: string;
}

export interface AutocompleteResult {
  options: AutocompleteOption[];
  placeholder?: string;
}

export function parseAutocompleteResult(result: unknown): AutocompleteResult {
  const record = result as {
    options?: { label?: unknown; value?: unknown; inputSchema?: unknown }[];
    placeholder?: string;
  } | null;
  if (!record || !Array.isArray(record.options)) return { options: [] };
  return {
    options: record.options
      .filter((option) => typeof option.value === "string")
      .map((option) => ({
        label:
          typeof option.label === "string"
            ? option.label
            : (option.value as string),
        value: option.value as string,
        inputSchema:
          typeof option.inputSchema === "string"
            ? option.inputSchema
            : undefined,
      })),
    placeholder: record.placeholder,
  };
}

const inputClass =
  "w-full rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-800";

export function AutocompleteInput(props: {
  value: string;
  onCommit: (value: string) => void;
  onPick?: (option: AutocompleteOption) => void;
  placeholder?: string;
  className?: string;
  loadOptions?: () => Promise<unknown>;
}) {
  const listId = useId();
  const [text, setText] = useState(props.value);
  const [prevValue, setPrevValue] = useState(props.value);
  if (props.value !== prevValue) {
    setPrevValue(props.value);
    setText(props.value);
  }
  const [result, setResult] = useState<AutocompleteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = () => {
    if (!props.loadOptions || loading) return;
    setLoading(true);
    props.loadOptions().then(
      (raw) => {
        setResult(parseAutocompleteResult(raw));
        setError(null);
        setLoading(false);
      },
      (loadError: unknown) => {
        setError(
          loadError instanceof Error ? loadError.message : String(loadError),
        );
        setLoading(false);
      },
    );
  };

  return (
    <div>
      <input
        className={props.className ?? inputClass}
        value={text}
        list={listId}
        placeholder={result?.placeholder ?? props.placeholder}
        spellCheck={false}
        onFocus={refresh}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          const picked = result?.options.find(
            (option) => option.value === next,
          );
          if (picked) {
            props.onCommit(next);
            props.onPick?.(picked);
          }
        }}
        onBlur={() => {
          if (text !== props.value) props.onCommit(text);
        }}
      />
      <datalist id={listId}>
        {(result?.options ?? []).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </datalist>
      {error ? (
        <p className="mt-0.5 text-[11px] text-red-500">{error}</p>
      ) : null}
    </div>
  );
}
