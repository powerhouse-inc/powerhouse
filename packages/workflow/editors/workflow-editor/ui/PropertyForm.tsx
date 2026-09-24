// Property-driven config form, modeled on the Activepieces piece-properties
// panel: one control per prop, typed by the descriptor.
import {
  lazy,
  Suspense,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Button,
  FieldError,
  Hint,
  IconButton,
  invalidClass,
  Segmented,
  Select,
  Switch,
  textAreaClass,
  textInputClass,
} from "../../shared/controls.js";
import { Icon } from "../../shared/icons.js";
import { ActionListEditor } from "./ActionListEditor.js";
import { AutocompleteInput } from "./Autocomplete.js";
import {
  ExpressionPickerButton,
  ExpressionTokenLine,
  useExpressionField,
} from "./ExpressionPicker.js";
import { hasExpressions } from "./expression-tokens.js";
import { isPropVisible } from "./validation.js";
import type { BlockFormProp, SecretFormService, SecretStat } from "./forms.js";
import { isEmptyValue } from "./validation.js";

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

const WHOLE_EXPRESSION = /^\{\{\s*[^{}]+?\s*\}\}$/;

function stringifyValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value as number | boolean);
  }
}

interface DropdownResult {
  options: { label: string; value: unknown }[];
  placeholder?: string;
  disabled?: boolean;
}

function parseDropdownResult(result: unknown): DropdownResult {
  const record = result as {
    options?: { label?: unknown; value?: unknown }[];
    placeholder?: string;
    disabled?: boolean;
  } | null;
  if (!record || !Array.isArray(record.options)) {
    throw new Error("Unexpected options result");
  }
  return {
    options: record.options.map((option) => ({
      label: stringifyValue(option.label ?? option.value),
      value: option.value,
    })),
    placeholder: record.placeholder,
    disabled: record.disabled,
  };
}

function parseDescriptorList(result: unknown): BlockFormProp[] {
  if (!Array.isArray(result)) throw new Error("Unexpected properties result");
  return result.filter(
    (entry): entry is BlockFormProp =>
      entry !== null &&
      typeof entry === "object" &&
      typeof (entry as BlockFormProp).name === "string",
  );
}

type LoadState<T> =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; result: T }
  | { kind: "error"; message: string };

const RELOAD_DEBOUNCE_MS = 400;

// Auto-loads on mount, re-loads (debounced) whenever `key` changes; the
// returned reload is the manual retry.
function useResolvedProp<T>(
  load: (() => Promise<unknown>) | undefined,
  parse: (raw: unknown) => T,
  key: string,
): { state: LoadState<T>; reload: () => void } {
  const [state, setState] = useState<LoadState<T>>({ kind: "idle" });
  const [attempt, setAttempt] = useState(0);
  const loadRef = useRef(load);
  // eslint-disable-next-line react-hooks-extra/refs -- latest-value refs, only read inside the effect below
  loadRef.current = load;
  const parseRef = useRef(parse);
  // eslint-disable-next-line react-hooks-extra/refs -- latest-value refs, only read inside the effect below
  parseRef.current = parse;
  const first = useRef(true);

  useEffect(() => {
    if (!loadRef.current) return;
    let alive = true;
    const run = () => {
      setState({ kind: "loading" });
      loadRef
        .current?.()
        .then((raw) => {
          if (alive) setState({ kind: "ready", result: parseRef.current(raw) });
        })
        .catch((error: unknown) => {
          if (alive) {
            setState({
              kind: "error",
              message: error instanceof Error ? error.message : String(error),
            });
          }
        });
    };
    const delay = first.current ? 0 : RELOAD_DEBOUNCE_MS;
    first.current = false;
    const timer = setTimeout(run, delay);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [key, attempt]);

  return { state, reload: () => setAttempt((value) => value + 1) };
}

// Deferred: react-markdown's remark chain is a large graph, and most blocks
// carry no markdown at all.
const PieceMarkdown = lazy(() => import("./PieceMarkdown.js"));

// Substituted when the endpoint is not available, rather than left as the raw
// placeholder: an author must not be told to paste "{{webhookUrl}}".
const NO_ENDPOINT = "[no endpoint yet — see Endpoint URL above]";

// Activepieces writes its setup instructions as markdown carrying these
// placeholders; unsubstituted, an author is told to paste "{{webhookUrl}}".
export function fillPiecePlaceholders(
  text: string,
  values: { webhookUrl?: string; webhookTimeoutSeconds?: number },
): string {
  return text
    .replace(/\{\{\s*webhookUrl\s*\}\}/g, values.webhookUrl ?? NO_ENDPOINT)
    .replace(
      /\{\{\s*webhookTimeoutSeconds\s*\}\}/g,
      values.webhookTimeoutSeconds === undefined
        ? "{{webhookTimeoutSeconds}}"
        : String(values.webhookTimeoutSeconds),
    );
}

// Marks controls whose runtime support has not landed yet.
export function AvailableSoon(props: { children?: ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-wf-warn/10 px-2 py-0.5 text-[11px] font-medium normal-case tracking-normal text-wf-warn"
      title="Not supported by the runtime yet"
    >
      Available soon{props.children ? <span>: {props.children}</span> : null}
    </span>
  );
}

// The label points at its control by id rather than wrapping it: a wrapping
// label would bind to the first control inside, the "Insert data" button.
function FieldShell(props: {
  prop: BlockFormProp;
  invalid: boolean;
  htmlFor?: string;
  picker?: ReactNode;
  children: ReactNode;
  error?: string | null;
}) {
  const { prop } = props;
  const LabelTag = props.htmlFor ? "label" : "span";
  return (
    <div>
      <div className="mb-1.5 flex min-h-6 items-center justify-between gap-2">
        <LabelTag
          htmlFor={props.htmlFor}
          className="flex min-w-0 items-baseline gap-1.5 text-[13px] font-medium text-foreground"
        >
          <span className="truncate">{prop.displayName}</span>
          {!prop.required ? (
            <span className="shrink-0 text-xs font-normal text-muted-foreground">
              Optional
            </span>
          ) : null}
          {props.invalid ? (
            <span className="shrink-0 text-xs font-normal text-wf-warn">
              Needs a value
            </span>
          ) : null}
        </LabelTag>
        {props.picker ? (
          <span className="flex shrink-0 items-center gap-0.5">
            {props.picker}
          </span>
        ) : null}
      </div>
      {props.children}
      <FieldError>{props.error}</FieldError>
      <Hint text={prop.description} />
    </div>
  );
}

function OptionList(props: {
  options: { label: string; value: unknown }[];
  selected: unknown[];
  onChange: (next: unknown[]) => void;
  invalid: boolean;
  loading?: boolean;
  onRefresh?: () => void;
  placeholder?: string;
  id?: string;
}) {
  const keyOf = (value: unknown) => stringifyValue(value);
  const byKey = new Map(
    props.options.map((option) => [keyOf(option.value), option]),
  );
  return (
    <Select
      id={props.id}
      multiple
      options={props.options.map((option) => ({
        value: keyOf(option.value),
        label: option.label,
      }))}
      value={props.selected.map(keyOf)}
      onChange={(keys) =>
        props.onChange(keys.map((key) => byKey.get(key)?.value ?? key))
      }
      invalid={props.invalid}
      loading={props.loading}
      onRefresh={props.onRefresh}
      placeholder={props.placeholder ?? "Choose any"}
    />
  );
}

// Single choice over typed option values, keyed by their serialised form.
function OptionSelect(props: {
  options: { label: string; value: unknown }[];
  value: unknown;
  onChange: (next: unknown) => void;
  invalid: boolean;
  placeholder?: string;
  loading?: boolean;
  disabled?: boolean;
  onRefresh?: () => void;
  clearable?: boolean;
  emptyText?: string;
  id?: string;
}) {
  const keyOf = (value: unknown) => stringifyValue(value);
  const byKey = new Map(
    props.options.map((option) => [keyOf(option.value), option]),
  );
  return (
    <Select
      id={props.id}
      options={props.options.map((option) => ({
        value: keyOf(option.value),
        label: option.label,
      }))}
      value={keyOf(props.value)}
      onChange={(key) =>
        props.onChange(key === "" ? undefined : (byKey.get(key)?.value ?? key))
      }
      invalid={props.invalid}
      placeholder={props.placeholder}
      loading={props.loading}
      disabled={props.disabled}
      onRefresh={props.onRefresh}
      clearable={props.clearable}
      emptyText={props.emptyText}
    />
  );
}

// Rows of nested forms for an ARRAY prop with item properties.
function ArrayRows(props: {
  prop: BlockFormProp;
  value: unknown;
  onCommit: (value: unknown) => void;
  scopeStepId?: string;
  invalid: boolean;
}) {
  const fields = props.prop.properties ?? [];
  const rows = Array.isArray(props.value)
    ? props.value.map((item) =>
        item !== null && typeof item === "object"
          ? (item as Record<string, unknown>)
          : {},
      )
    : [];
  const update = (next: Record<string, unknown>[]) =>
    props.onCommit(next.length > 0 ? next : undefined);
  return (
    <div
      className={`flex flex-col gap-2 ${props.invalid ? "rounded-md ring-1 ring-wf-warn/50" : ""}`}
    >
      {rows.map((row, index) => (
        <div
          key={index}
          className="rounded-lg border border-solid border-foreground/10 bg-muted/40 p-3"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Item {index + 1}
            </span>
            <IconButton
              icon="trash"
              label={`Remove item ${index + 1}`}
              onClick={() => update(rows.filter((_, i) => i !== index))}
            />
          </div>
          <PropertyForm
            props={fields}
            value={row}
            onChange={(next) =>
              update(rows.map((entry, i) => (i === index ? next : entry)))
            }
            scopeStepId={props.scopeStepId}
            nested
          />
        </div>
      ))}
      <Button
        size="sm"
        className="self-start"
        onClick={() => update([...rows, {}])}
      >
        <Icon name="plus" className="h-3.5 w-3.5" />
        Add item
      </Button>
    </div>
  );
}

// Key/value rows for an OBJECT dictionary; values stay strings.
function ObjectRows(props: {
  value: Record<string, unknown>;
  onCommit: (value: Record<string, unknown> | undefined) => void;
  invalid: boolean;
}) {
  const [rows, setRows] = useState(() =>
    Object.entries(props.value).map(([key, value]) => ({
      key,
      value: stringifyValue(value),
    })),
  );
  const [prevValue, setPrevValue] = useState(props.value);
  if (props.value !== prevValue) {
    setPrevValue(props.value);
    setRows(
      Object.entries(props.value).map(([key, value]) => ({
        key,
        value: stringifyValue(value),
      })),
    );
  }
  const commit = (next: { key: string; value: string }[]) => {
    setRows(next);
    const record: Record<string, unknown> = {};
    for (const row of next) {
      if (row.key.trim() !== "") record[row.key.trim()] = row.value;
    }
    props.onCommit(Object.keys(record).length > 0 ? record : undefined);
  };
  return (
    <div
      className={`flex flex-col gap-1.5 ${props.invalid ? "rounded-md ring-1 ring-wf-warn/50" : ""}`}
    >
      {rows.map((row, index) => (
        <div key={index} className="flex items-center gap-1">
          <input
            className={`${textInputClass} font-mono text-xs`}
            placeholder="Key"
            value={row.key}
            onChange={(event) =>
              setRows(
                rows.map((entry, i) =>
                  i === index ? { ...entry, key: event.target.value } : entry,
                ),
              )
            }
            onBlur={() => commit(rows)}
          />
          <input
            className={`${textInputClass} font-mono text-xs`}
            placeholder="Value"
            value={row.value}
            onChange={(event) =>
              setRows(
                rows.map((entry, i) =>
                  i === index ? { ...entry, value: event.target.value } : entry,
                ),
              )
            }
            onBlur={() => commit(rows)}
          />
          <IconButton
            icon="close"
            label="Remove entry"
            onClick={() => commit(rows.filter((_, i) => i !== index))}
          />
        </div>
      ))}
      <Button
        size="sm"
        className="self-start"
        onClick={() => setRows([...rows, { key: "", value: "" }])}
      >
        <Icon name="plus" className="h-3.5 w-3.5" />
        Add entry
      </Button>
    </div>
  );
}

// ISO ↔ the local wall-clock string a datetime-local input speaks.
function isoToLocalInput(value: unknown): string {
  if (typeof value !== "string" || value === "") return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localInputToIso(value: string): string | undefined {
  if (value === "") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

const TEXT_MODE_TYPES = new Set([
  "SHORT_TEXT",
  "LONG_TEXT",
  "NUMBER",
  "SECRET_TEXT",
  "FILE",
  "JSON",
  "DATE_TIME",
  "OBJECT",
]);

const SECRET_REF_PREFIX = "secret://v1:";

// Mirrors the connection editor's SecretField: the input takes the VALUE and
// only the minted ref reaches the config. Pasting over a ref rotates it.
function SecretRefField(props: {
  prop: BlockFormProp;
  value: unknown;
  onCommit: (value: unknown) => void;
  invalid: boolean;
  secrets?: SecretFormService;
}) {
  const { secrets } = props;
  const fieldId = useId();
  const ref = typeof props.value === "string" ? props.value : "";
  const managed = ref.startsWith(SECRET_REF_PREFIX);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stat, setStat] = useState<SecretStat | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks-extra/set-state-in-effect -- clears the stale stat before the ref's own fetch
    setStat(null);
    if (!managed || !secrets) return;
    let cancelled = false;
    secrets.stat(ref).then(
      (result) => {
        if (!cancelled) setStat(result);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [ref, managed, secrets]);

  const commit = () => {
    if (draft === "" || busy || !secrets) return;
    setBusy(true);
    setError(null);
    secrets
      .save({
        ref: managed ? ref : undefined,
        value: draft,
        label: props.prop.displayName,
      })
      .then((result) => {
        setDraft("");
        if (result.ref !== ref) props.onCommit(result.ref);
        else setStat(result);
      })
      .catch((requestError: unknown) => {
        setError(
          requestError instanceof Error
            ? requestError.message
            : String(requestError),
        );
      })
      .finally(() => setBusy(false));
  };

  if (!secrets) {
    return (
      <FieldShell htmlFor={fieldId} prop={props.prop} invalid={props.invalid}>
        <p className="text-xs text-muted-foreground">
          Managed secrets are unavailable in this session.
        </p>
      </FieldShell>
    );
  }
  return (
    <FieldShell
      htmlFor={fieldId}
      prop={props.prop}
      invalid={props.invalid}
      error={error}
    >
      {managed ? (
        <p className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {stat?.label ?? ref}
          </span>
          {stat ? <span>version {stat.version}</span> : null}
          {stat?.status === "DELETED" ? (
            <span className="font-medium text-wf-fail">deleted</span>
          ) : null}
        </p>
      ) : null}
      <div className="flex items-center gap-1">
        <input
          id={fieldId}
          className={`${textInputClass} ${props.invalid ? invalidClass : ""}`}
          type="password"
          value={draft}
          disabled={busy}
          placeholder={
            managed
              ? "Paste a new value to replace it"
              : "Paste the secret value"
          }
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
          }}
          onBlur={commit}
        />
        {ref ? (
          <IconButton
            icon="close"
            label="Remove secret"
            onClick={() => props.onCommit(undefined)}
          />
        ) : null}
      </div>
    </FieldShell>
  );
}

function PropField(props: {
  prop: BlockFormProp;
  value: unknown;
  onCommit: (value: unknown) => void;
  loadOptions?: (propName: string) => Promise<unknown>;
  secrets?: SecretFormService;
  scopeStepId?: string;
  // Changes whenever a refresher value or the connection changes.
  refresherKey: string;
  // Inside an ARRAY item or DYNAMIC result: options cannot load yet.
  nested?: boolean;
  // Substituted into MARKDOWN props; absent until the endpoint is minted.
  webhookUrl?: string;
}) {
  const { prop, value, onCommit } = props;
  const fieldId = useId();
  const optionsUnavailable = Boolean(
    props.nested && prop.hasDynamicResolver && !props.loadOptions,
  );
  const fieldRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const invalid =
    prop.required && prop.type !== "MARKDOWN" && isEmptyValue(value);

  // Live text of the field for token highlighting (inputs are uncontrolled).
  const [draft, setDraft] = useState(() => stringifyValue(value));
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setDraft(stringifyValue(value));
  }
  const [jsonError, setJsonError] = useState<string | null>(null);
  // DATE_TIME / OBJECT flip to a text input when bound to an expression.
  const [textMode, setTextMode] = useState(() => hasExpressions(value));

  // JSON-ish fields only splice the text; their blur handler parses/commits.
  const commitsOnInsert = prop.type !== "JSON";
  const field = useExpressionField({
    stepId: props.scopeStepId,
    label: prop.displayName,
    insert: (expression) => {
      if ((prop.type === "DATE_TIME" || prop.type === "OBJECT") && !textMode) {
        setTextMode(true);
        setDraft(expression);
        onCommit(expression);
        return;
      }
      if (!fieldRef.current) return;
      const next = insertAtCursor(fieldRef.current, expression);
      setDraft(next);
      if (commitsOnInsert) onCommit(next);
    },
  });
  const picker = TEXT_MODE_TYPES.has(prop.type) ? (
    <ExpressionPickerButton active={field.active} onFocusField={field.focus} />
  ) : undefined;

  const dynamicLoad =
    props.loadOptions && prop.hasDynamicResolver
      ? () => props.loadOptions!(prop.name)
      : undefined;
  const isDropdown =
    prop.type === "DROPDOWN" || prop.type === "MULTI_SELECT_DROPDOWN";
  const dropdown = useResolvedProp(
    isDropdown ? dynamicLoad : undefined,
    parseDropdownResult,
    props.refresherKey,
  );
  const dynamic = useResolvedProp(
    prop.type === "DYNAMIC" ? dynamicLoad : undefined,
    parseDescriptorList,
    props.refresherKey,
  );

  const retryButton = (state: LoadState<unknown>, reload: () => void) => (
    <IconButton
      icon="retry"
      label="Reload"
      disabled={state.kind === "loading"}
      onClick={reload}
    />
  );
  const loadError = (state: LoadState<unknown>) =>
    state.kind === "error" ? state.message : null;

  const textInput = (extra: {
    type?: string;
    mono?: boolean;
    placeholder?: string;
    commit: (raw: string) => void;
  }) => (
    <>
      <div className="flex items-center gap-1">
        <input
          id={fieldId}
          ref={fieldRef as React.RefObject<HTMLInputElement>}
          type={extra.type ?? "text"}
          className={`${textInputClass} ${extra.mono ? "font-mono text-xs" : ""} ${
            invalid ? invalidClass : ""
          }`}
          defaultValue={stringifyValue(value)}
          placeholder={extra.placeholder ?? prop.placeholder}
          spellCheck={false}
          onFocus={field.focus}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={(event) => extra.commit(event.target.value)}
        />
      </div>
      {extra.type === "password" ? null : <ExpressionTokenLine value={draft} />}
    </>
  );

  switch (prop.type) {
    case "PH_SECRET_REF":
      return (
        <SecretRefField
          prop={prop}
          value={value}
          onCommit={onCommit}
          invalid={invalid}
          secrets={props.secrets}
        />
      );
    case "PH_AUTOCOMPLETE":
      return (
        <FieldShell htmlFor={fieldId} prop={prop} invalid={invalid}>
          <AutocompleteInput
            id={fieldId}
            className={`${textInputClass} ${invalid ? invalidClass : ""}`}
            value={typeof value === "string" ? value : stringifyValue(value)}
            onCommit={(next) => onCommit(next === "" ? undefined : next)}
            loadOptions={
              props.loadOptions
                ? () => props.loadOptions!(prop.name)
                : undefined
            }
          />
        </FieldShell>
      );
    case "PH_ACTIONS":
      return (
        <FieldShell htmlFor={fieldId} prop={prop} invalid={invalid}>
          <ActionListEditor
            value={value}
            onCommit={onCommit}
            loadActionTypes={
              props.loadOptions
                ? () => props.loadOptions!("actionType")
                : undefined
            }
          />
        </FieldShell>
      );
    case "MARKDOWN": {
      const markdown = fillPiecePlaceholders(
        stringifyValue(
          prop.description ?? prop.defaultValue ?? prop.displayName,
        ),
        { webhookUrl: props.webhookUrl },
      );
      // The fallback keeps the text readable while the chunk loads, rather
      // than collapsing the panel's height and reflowing it.
      return (
        <Suspense
          fallback={
            <p className="whitespace-pre-wrap rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              {markdown}
            </p>
          }
        >
          <PieceMarkdown text={markdown} />
        </Suspense>
      );
    }
    case "CHECKBOX":
      return (
        <Switch
          checked={Boolean(value)}
          onChange={(checked) => onCommit(checked)}
          label={prop.displayName}
          description={prop.description}
        />
      );
    case "NUMBER":
      // Text input so expressions stay possible; numeric text commits a number.
      return (
        <FieldShell
          htmlFor={fieldId}
          prop={prop}
          invalid={invalid}
          picker={picker}
        >
          {textInput({
            commit: (raw) => {
              const trimmed = raw.trim();
              if (trimmed === "") return onCommit(undefined);
              const parsed = Number(trimmed);
              onCommit(Number.isFinite(parsed) ? parsed : trimmed);
            },
          })}
        </FieldShell>
      );
    case "SECRET_TEXT":
      return (
        <FieldShell
          htmlFor={fieldId}
          prop={prop}
          invalid={invalid}
          picker={picker}
        >
          {textInput({
            type: "password",
            commit: (raw) => onCommit(raw === "" ? undefined : raw),
          })}
        </FieldShell>
      );
    case "FILE":
      return (
        <FieldShell
          htmlFor={fieldId}
          prop={prop}
          invalid={invalid}
          picker={picker}
        >
          {textInput({
            mono: true,
            placeholder: prop.placeholder ?? "https://… or data:…;base64,…",
            commit: (raw) =>
              onCommit(raw.trim() === "" ? undefined : raw.trim()),
          })}
        </FieldShell>
      );
    case "DATE_TIME":
      if (textMode) {
        return (
          <FieldShell
            htmlFor={fieldId}
            prop={prop}
            invalid={invalid}
            picker={picker}
          >
            {textInput({
              mono: true,
              placeholder: "ISO 8601 or {{expression}}",
              commit: (raw) => {
                const trimmed = raw.trim();
                if (trimmed === "") {
                  setTextMode(false);
                  return onCommit(undefined);
                }
                onCommit(
                  hasExpressions(trimmed) ? trimmed : localInputToIso(trimmed),
                );
              },
            })}
          </FieldShell>
        );
      }
      return (
        <FieldShell
          htmlFor={fieldId}
          prop={prop}
          invalid={invalid}
          picker={picker}
        >
          <input
            id={fieldId}
            type="datetime-local"
            className={`${textInputClass} ${invalid ? invalidClass : ""}`}
            defaultValue={isoToLocalInput(value)}
            onFocus={field.focus}
            onBlur={(event) => onCommit(localInputToIso(event.target.value))}
          />
        </FieldShell>
      );
    case "STATIC_DROPDOWN": {
      const options = prop.staticOptions ?? [];
      // A short either/or reads faster as buttons than as a closed list.
      if (
        prop.required !== true &&
        prop.defaultValue !== undefined &&
        options.length >= 2 &&
        options.length <= 3 &&
        options.every((option) => option.label.length <= 22)
      ) {
        return (
          <FieldShell htmlFor={fieldId} prop={prop} invalid={false}>
            <Segmented
              value={stringifyValue(value)}
              options={options.map((option) => ({
                value: stringifyValue(option.value),
                label: option.label,
              }))}
              onChange={(key) =>
                onCommit(
                  options.find((option) => stringifyValue(option.value) === key)
                    ?.value ?? key,
                )
              }
            />
          </FieldShell>
        );
      }
      return (
        <FieldShell htmlFor={fieldId} prop={prop} invalid={invalid}>
          <OptionSelect
            id={fieldId}
            options={prop.staticOptions ?? []}
            value={value}
            onChange={onCommit}
            invalid={invalid}
            placeholder={prop.placeholder}
            clearable={!prop.required}
          />
        </FieldShell>
      );
    }
    case "STATIC_MULTI_SELECT_DROPDOWN":
      return (
        <FieldShell htmlFor={fieldId} prop={prop} invalid={invalid}>
          <OptionList
            id={fieldId}
            options={prop.staticOptions ?? []}
            selected={Array.isArray(value) ? (value as unknown[]) : []}
            onChange={(next) => onCommit(next.length > 0 ? next : undefined)}
            invalid={invalid}
          />
        </FieldShell>
      );
    case "DROPDOWN": {
      const result =
        dropdown.state.kind === "ready" ? dropdown.state.result : null;
      const current = stringifyValue(value);
      return (
        <FieldShell
          htmlFor={fieldId}
          prop={prop}
          invalid={invalid}
          error={loadError(dropdown.state)}
          picker={optionsUnavailable ? <AvailableSoon /> : undefined}
        >
          <OptionSelect
            id={fieldId}
            options={result?.options ?? []}
            value={value}
            onChange={onCommit}
            invalid={invalid}
            loading={dropdown.state.kind === "loading"}
            disabled={(result?.disabled && !current) || optionsUnavailable}
            onRefresh={dynamicLoad ? dropdown.reload : undefined}
            clearable={!prop.required}
            emptyText={
              result?.placeholder ??
              "Nothing to choose from yet. Some lists need a connection first."
            }
            placeholder={
              optionsUnavailable
                ? "Options for nested fields are available soon"
                : (result?.placeholder ?? prop.placeholder)
            }
          />
        </FieldShell>
      );
    }
    case "MULTI_SELECT_DROPDOWN": {
      const result =
        dropdown.state.kind === "ready" ? dropdown.state.result : null;
      const selected: unknown[] = Array.isArray(value) ? value : [];
      // Keep selections the current options don't list so they stay visible.
      const listed = new Set(
        (result?.options ?? []).map((o) => stringifyValue(o.value)),
      );
      const extra = selected
        .filter((entry) => !listed.has(stringifyValue(entry)))
        .map((entry) => ({ label: stringifyValue(entry), value: entry }));
      return (
        <FieldShell
          htmlFor={fieldId}
          prop={prop}
          invalid={invalid}
          error={loadError(dropdown.state)}
          picker={optionsUnavailable ? <AvailableSoon /> : undefined}
        >
          {optionsUnavailable ? (
            <p className="text-xs text-muted-foreground">
              Options for nested fields are available soon.
            </p>
          ) : (
            <OptionList
              id={fieldId}
              options={[...extra, ...(result?.options ?? [])]}
              selected={selected}
              onChange={(next) => onCommit(next.length > 0 ? next : undefined)}
              invalid={invalid}
              loading={dropdown.state.kind === "loading"}
              onRefresh={dynamicLoad ? dropdown.reload : undefined}
              placeholder={result?.placeholder ?? prop.placeholder}
            />
          )}
        </FieldShell>
      );
    }
    case "DYNAMIC": {
      const fields =
        dynamic.state.kind === "ready" ? dynamic.state.result : null;
      const record =
        value !== null && typeof value === "object" && !Array.isArray(value)
          ? (value as Record<string, unknown>)
          : {};
      return (
        <FieldShell
          htmlFor={fieldId}
          prop={prop}
          invalid={invalid && fields !== null && fields.length > 0}
          error={loadError(dynamic.state)}
          picker={
            optionsUnavailable ? (
              <AvailableSoon />
            ) : dynamicLoad ? (
              retryButton(dynamic.state, dynamic.reload)
            ) : undefined
          }
        >
          {optionsUnavailable ? (
            <p className="text-xs text-muted-foreground">
              Nested dynamic properties are available soon.
            </p>
          ) : dynamic.state.kind === "loading" && !fields ? (
            <p className="text-xs text-muted-foreground">
              Resolving properties…
            </p>
          ) : !dynamicLoad ? (
            <p className="text-xs text-muted-foreground">
              Properties resolve once the runtime is reachable.
            </p>
          ) : fields && fields.length > 0 ? (
            <div className="rounded-lg border border-solid border-foreground/10 bg-muted/40 p-3">
              <PropertyForm
                props={fields}
                value={record}
                onChange={(next) =>
                  onCommit(Object.keys(next).length > 0 ? next : undefined)
                }
                scopeStepId={props.scopeStepId}
                nested
              />
            </div>
          ) : fields ? (
            <p className="text-xs text-muted-foreground">
              No properties for the current selection.
            </p>
          ) : null}
        </FieldShell>
      );
    }
    case "ARRAY": {
      if (prop.properties && prop.properties.length > 0) {
        return (
          <FieldShell htmlFor={fieldId} prop={prop} invalid={invalid}>
            <ArrayRows
              prop={prop}
              value={value}
              onCommit={onCommit}
              scopeStepId={props.scopeStepId}
              invalid={invalid}
            />
          </FieldShell>
        );
      }
      // Plain list: one item per line; a lone whole expression binds the list.
      const lines = Array.isArray(value)
        ? value.map((item) => stringifyValue(item)).join("\n")
        : stringifyValue(value);
      return (
        <FieldShell
          htmlFor={fieldId}
          prop={prop}
          invalid={invalid}
          picker={
            <ExpressionPickerButton
              active={field.active}
              onFocusField={field.focus}
            />
          }
        >
          <textarea
            id={fieldId}
            ref={fieldRef as React.RefObject<HTMLTextAreaElement>}
            className={`${textAreaClass} font-mono text-xs ${
              invalid ? invalidClass : ""
            }`}
            defaultValue={lines}
            placeholder={prop.placeholder ?? "One item per line"}
            spellCheck={false}
            onFocus={field.focus}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={(event) => {
              const items = event.target.value
                .split("\n")
                .map((line) => line.trim())
                .filter((line) => line !== "");
              if (items.length === 0) return onCommit(undefined);
              if (items.length === 1 && WHOLE_EXPRESSION.test(items[0])) {
                return onCommit(items[0]);
              }
              onCommit(items);
            }}
          />
          <ExpressionTokenLine value={draft} />
        </FieldShell>
      );
    }
    case "OBJECT": {
      if (textMode) {
        return (
          <FieldShell
            htmlFor={fieldId}
            prop={prop}
            invalid={invalid}
            picker={picker}
          >
            {textInput({
              mono: true,
              placeholder: "{{expression}} yielding an object",
              commit: (raw) => {
                const trimmed = raw.trim();
                if (trimmed === "") {
                  setTextMode(false);
                  return onCommit(undefined);
                }
                onCommit(trimmed);
              },
            })}
          </FieldShell>
        );
      }
      const record =
        value !== null && typeof value === "object" && !Array.isArray(value)
          ? (value as Record<string, unknown>)
          : {};
      return (
        <FieldShell
          htmlFor={fieldId}
          prop={prop}
          invalid={invalid}
          picker={picker}
        >
          <ObjectRows value={record} onCommit={onCommit} invalid={invalid} />
        </FieldShell>
      );
    }
    case "LONG_TEXT":
    case "JSON": {
      const isJson = prop.type === "JSON";
      return (
        <FieldShell
          htmlFor={fieldId}
          prop={prop}
          invalid={invalid}
          picker={picker}
          error={jsonError}
        >
          <textarea
            id={fieldId}
            ref={fieldRef as React.RefObject<HTMLTextAreaElement>}
            className={`${textAreaClass} ${isJson ? "font-mono text-xs" : ""} ${
              invalid ? invalidClass : ""
            }`}
            defaultValue={stringifyValue(value)}
            placeholder={prop.placeholder}
            spellCheck={false}
            onFocus={field.focus}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={(event) => {
              const raw = event.target.value;
              if (!isJson) return onCommit(raw === "" ? undefined : raw);
              const trimmed = raw.trim();
              if (trimmed === "") {
                setJsonError(null);
                return onCommit(undefined);
              }
              // A whole expression resolves to the value at run time.
              if (WHOLE_EXPRESSION.test(trimmed)) {
                setJsonError(null);
                return onCommit(trimmed);
              }
              try {
                onCommit(JSON.parse(trimmed));
                setJsonError(null);
              } catch {
                setJsonError("Not valid JSON, so it wasn't saved.");
              }
            }}
          />
          <ExpressionTokenLine value={draft} />
        </FieldShell>
      );
    }
    default:
      return (
        <FieldShell
          htmlFor={fieldId}
          prop={prop}
          invalid={invalid}
          picker={picker}
        >
          {textInput({
            commit: (raw) => onCommit(raw === "" ? undefined : raw),
          })}
        </FieldShell>
      );
  }
}

// Serialises the values a prop's resolver depends on (+ the connection).
function refresherKeyFor(
  prop: BlockFormProp,
  current: Record<string, unknown>,
  connectionId: string | undefined,
): string {
  const refreshers = (prop.refreshers ?? []).filter((name) => name !== "auth");
  const values = refreshers.map((name) => current[name]);
  try {
    return JSON.stringify([connectionId ?? null, values]);
  } catch {
    return String(connectionId);
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
  // Backs PH_SECRET_REF props.
  secrets?: SecretFormService;
  // Step whose config is being edited; scopes the expression picker.
  scopeStepId?: string;
  // Auth-dependent resolvers re-run when this changes.
  connectionId?: string;
  // Rendered inside another field; nested resolvers are not loadable yet.
  nested?: boolean;
  // This workflow's endpoint URL, for a piece's setup markdown.
  webhookUrl?: string;
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

  // A hidden field's value is not cleared: switching scheme to None and back
  // must not silently discard the secret ref the author already minted.
  const visible = props.props.filter((prop) => isPropVisible(prop, current));
  const essential = visible.filter((prop) => !prop.advanced);
  const advanced = visible.filter((prop) => prop.advanced);
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Closed even when advanced fields hold values, so the count goes in the
  // label — else config already in effect reads as config that is not there.
  const advancedSet = advanced.filter(
    (prop) => current[prop.name] !== undefined,
  ).length;

  const field = (prop: BlockFormProp) => (
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
      secrets={props.secrets}
      scopeStepId={props.scopeStepId}
      refresherKey={refresherKeyFor(prop, current, props.connectionId)}
      nested={props.nested}
      webhookUrl={props.webhookUrl}
    />
  );

  return (
    <div className={`flex flex-col ${props.nested ? "gap-4" : "gap-5"}`}>
      {essential.map(field)}
      {advanced.length > 0 ? (
        <div className="flex flex-col gap-5 border-t border-solid border-foreground/10 pt-4">
          <button
            type="button"
            className="-mx-1 flex items-center gap-1.5 self-start rounded px-1 text-[13px] font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            aria-expanded={showAdvanced}
            onClick={() => setShowAdvanced((open) => !open)}
          >
            <Icon
              name="chevron"
              className={`h-3.5 w-3.5 transition-transform ${showAdvanced ? "rotate-90" : ""}`}
            />
            More options
            <span className="font-normal">
              {advancedSet > 0
                ? `${advanced.length} fields, ${advancedSet} set`
                : `${advanced.length} fields`}
            </span>
          </button>
          <div hidden={!showAdvanced} className="flex flex-col gap-5">
            {advanced.map(field)}
          </div>
        </div>
      ) : null}
    </div>
  );
}
