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
  type SelectAction,
  Switch,
  textAreaClass,
  textInputClass,
} from "../../shared/controls.js";
import { Icon } from "../../shared/icons.js";
import {
  ExpressionPickerButton,
  ExpressionTokenLine,
  useExpressionField,
} from "./ExpressionPicker.js";
import { hasExpressions } from "./expression-tokens.js";
import {
  useDynamicCache,
  useOptionSearch,
  useResolvedProp,
  type LoadState,
} from "./design-time.js";
import type { PropertyModeValue, PropertySettingModel } from "./model.js";
import type { BlockRef } from "./blocks.js";
import type { ResolverKeyInput } from "./query-keys.js";
import {
  isPropVisible,
  parsePropList,
  resolverInputFor,
  settingFor,
  stripOptions,
  withSetting,
} from "./validation.js";
import type {
  BlockFormProp,
  FormOption,
  PropertyGroup,
  SecretFormService,
} from "./forms.js";
import { useSecretRef } from "./secret-ref.js";
import { lacksDefaults, withPropDefaults } from "./prop-defaults.js";
import {
  ColorField,
  DateRangeField,
  MarkdownCallout,
  NumberStepper,
  numberRangeError,
  numberRangeText,
  OptionCards,
  optionIcon,
  richTextMode,
} from "./prop-controls.js";
import { PropLayout } from "./prop-layout.js";
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

// Plain decimal notation only; Number() would take "0x10" or "1e3".
const DECIMAL = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/;

export function parseDecimal(raw: string): number | undefined {
  const trimmed = raw.trim();
  return DECIMAL.test(trimmed) ? Number(trimmed) : undefined;
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

interface DropdownResult {
  options: FormOption[];
  placeholder?: string;
  disabled?: boolean;
}

function parseDropdownResult(result: unknown): DropdownResult {
  const record = result as {
    options?: {
      label?: unknown;
      value?: unknown;
      description?: unknown;
      icon?: unknown;
    }[];
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
      ...(typeof option.description === "string" && option.description
        ? { description: option.description }
        : {}),
      ...(typeof option.icon === "string" ? { icon: option.icon } : {}),
    })),
    placeholder: record.placeholder,
    disabled: record.disabled,
  };
}

const RELOAD_DEBOUNCE_MS = 400;

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
    <div className="group/field">
      <div className="mb-1.5 flex min-h-6 items-center justify-between gap-2">
        <LabelTag
          htmlFor={props.htmlFor}
          className="flex min-w-0 items-baseline gap-1.5 text-[13px] font-medium text-foreground"
        >
          {optionIcon(prop.icon)}
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
  options: FormOption[];
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
  searchable?: boolean;
  actions?: SelectAction[];
  onQueryChange?: (query: string) => void;
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
        description: option.description,
        icon: optionIcon(option.icon),
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
      searchable={props.searchable}
      actions={props.actions}
      onQueryChange={props.onQueryChange}
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
        onClick={() => update([...rows, withPropDefaults(fields, {})])}
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

function isDropdownType(type: string): boolean {
  return type === "DROPDOWN" || type === "MULTI_SELECT_DROPDOWN";
}

const SEARCH_DEBOUNCE_MS = 300;

// Controls that are not text inputs, so an expression switches them to one.
const FLIPS_TO_TEXT = new Set([
  "DATE_TIME",
  "OBJECT",
  "DROPDOWN",
  "CHECKBOX",
  "NUMBER",
]);

const TEXT_MODE_TYPES = new Set([
  "SHORT_TEXT",
  "LONG_TEXT",
  "NUMBER",
  "SECRET_TEXT",
  "FILE",
  "JSON",
  "DATE_TIME",
  "OBJECT",
  "DROPDOWN",
  "CHECKBOX",
]);

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
  const { ref, managed, draft, setDraft, busy, error, stat, commit } =
    useSecretRef({
      value: props.value,
      secrets,
      label: props.prop.displayName,
      onCommit: props.onCommit,
    });

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

// A small text button in a field's label row that switches its mode.
function ModeButton(props: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="inline-flex h-6 shrink-0 items-center rounded-md px-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
      onClick={props.onClick}
    >
      {props.label}
    </button>
  );
}

function PropField(props: {
  prop: BlockFormProp;
  value: unknown;
  // A mode rides along when the edit also switched it.
  onCommit: (value: unknown, mode?: PropertyModeValue) => void;
  // The stored mode; absent means inferred from the value.
  mode?: PropertyModeValue;
  // A mode switch with no value change.
  onMode?: (mode: PropertyModeValue) => void;
  loadOptions?: (propName: string, searchValue?: string) => Promise<unknown>;
  // The form's other values, for a prop that reads a sibling.
  config?: Record<string, unknown>;
  secrets?: SecretFormService;
  scopeStepId?: string;
  // Keys the resolver's answer: block, prop, refresher values, connection.
  resolverInput: ResolverKeyInput;
  // A sibling this prop's resolver reads that is still empty.
  waitingOn?: string;
  // Inside an ARRAY item or DYNAMIC result: options cannot load yet.
  nested?: boolean;
  // Substituted into MARKDOWN props; absent until the endpoint is minted.
  webhookUrl?: string;
}) {
  const { prop, value } = props;
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
  // EXPRESSION mode: the field is a text input for a {{…}} value.
  const [textMode, setTextMode] = useState(props.mode === "EXPRESSION");
  const [prevMode, setPrevMode] = useState(props.mode);
  if (props.mode !== prevMode) {
    setPrevMode(props.mode);
    if (props.mode) setTextMode(props.mode === "EXPRESSION");
  }
  // Every edit records the field's mode, so it never has to be guessed.
  const onCommit = (next: unknown, mode?: PropertyModeValue) =>
    props.onCommit(next, mode ?? (textMode ? "EXPRESSION" : "MANUAL"));
  const toMode = (expression: boolean) => {
    setTextMode(expression);
    props.onMode?.(expression ? "EXPRESSION" : "MANUAL");
  };
  const [numberError, setNumberError] = useState<string | null>(null);

  // JSON-ish fields only splice the text; their blur handler parses/commits.
  const commitsOnInsert = prop.type !== "JSON";
  const field = useExpressionField({
    stepId: props.scopeStepId,
    label: prop.displayName,
    insert: (expression) => {
      if (FLIPS_TO_TEXT.has(prop.type) && !textMode) {
        setTextMode(true);
        setDraft(expression);
        setNumberError(null);
        onCommit(expression, "EXPRESSION");
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
  const dropdown = useResolvedProp({
    kind: "options",
    input: props.resolverInput,
    load: isDropdown ? dynamicLoad : undefined,
    parse: parseDropdownResult,
    debounceMs: RELOAD_DEBOUNCE_MS,
  });
  const dynamic = useResolvedProp({
    kind: "dynamic",
    input: props.resolverInput,
    load: prop.type === "DYNAMIC" ? dynamicLoad : undefined,
    parse: parsePropList,
    debounceMs: RELOAD_DEBOUNCE_MS,
  });
  // An unset DYNAMIC object stores its fields' defaults once they resolve.
  const dynamicFields =
    dynamic.state.kind === "ready" ? dynamic.state.result : null;
  useEffect(() => {
    if (value !== undefined || !dynamicFields) return;
    if (lacksDefaults(dynamicFields, {})) {
      props.onCommit(withPropDefaults(dynamicFields, {}), "MANUAL");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per schema
  }, [dynamicFields]);

  // refreshOnSearch: options() re-runs with what the author types, debounced;
  // a stale answer to an earlier query is dropped.
  const [searchQuery, setSearchQuery] = useState("");
  // A choice from search results, kept so the field still shows its label
  // once the list falls back to the unfiltered options.
  const [picked, setPicked] = useState<FormOption | null>(null);
  const loadOptions = props.loadOptions;
  const searchable = Boolean(prop.refreshOnSearch && loadOptions);
  const searchResult = useOptionSearch({
    input: props.resolverInput,
    query: searchQuery,
    load:
      searchable && loadOptions
        ? (searchValue) => loadOptions(prop.name, searchValue)
        : undefined,
    parse: parseDropdownResult,
    debounceMs: SEARCH_DEBOUNCE_MS,
  });
  const onSearch = searchable ? setSearchQuery : undefined;

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
        <MarkdownCallout variant={prop.variant}>
          <Suspense
            fallback={
              <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                {markdown}
              </p>
            }
          >
            <PieceMarkdown text={markdown} />
          </Suspense>
        </MarkdownCallout>
      );
    }
    case "CHECKBOX":
      if (textMode) {
        return (
          <FieldShell
            htmlFor={fieldId}
            prop={prop}
            invalid={invalid}
            picker={
              <>
                {picker}
                <ModeButton
                  label="Use a switch"
                  onClick={() => {
                    setTextMode(false);
                    onCommit(undefined, "MANUAL");
                  }}
                />
              </>
            }
          >
            {textInput({
              mono: true,
              placeholder: "{{steps.…}} yielding true or false",
              commit: (raw) => {
                const trimmed = raw.trim();
                if (trimmed === "") {
                  setTextMode(false);
                  return onCommit(undefined, "MANUAL");
                }
                onCommit(trimmed, "EXPRESSION");
              },
            })}
          </FieldShell>
        );
      }
      // A string here is not a choice; only true reads as on.
      return (
        <div className="group/field flex items-start gap-1">
          <div className="min-w-0 flex-1">
            <Switch
              checked={value === true}
              onChange={(checked) => onCommit(checked, "MANUAL")}
              label={prop.displayName}
              description={prop.description}
            />
          </div>
          {picker}
        </div>
      );
    case "NUMBER": {
      const rangeError = numberRangeError(value, prop.min, prop.max);
      // Manual text is a number or nothing; {{…}} switches to an expression.
      const commitNumber = (raw: string) => {
        const trimmed = raw.trim();
        if (trimmed === "") {
          setNumberError(null);
          if (!textMode) return onCommit(undefined);
          setTextMode(false);
          return onCommit(undefined, "MANUAL");
        }
        if (textMode || hasExpressions(trimmed)) {
          setNumberError(null);
          setTextMode(true);
          return onCommit(trimmed, "EXPRESSION");
        }
        const parsed = parseDecimal(trimmed);
        if (parsed === undefined) {
          setNumberError("Not a number");
          return;
        }
        setNumberError(null);
        onCommit(parsed);
      };
      if (prop.display === "stepper" && !textMode) {
        return (
          <FieldShell
            htmlFor={fieldId}
            prop={prop}
            invalid={invalid}
            picker={picker}
            error={numberError ?? rangeError}
          >
            <NumberStepper
              id={fieldId}
              value={value}
              min={prop.min}
              max={prop.max}
              step={prop.step}
              invalid={invalid || rangeError !== null || numberError !== null}
              onCommit={(next) => {
                setNumberError(null);
                onCommit(next);
              }}
              onCommitText={commitNumber}
              onFocus={field.focus}
            />
          </FieldShell>
        );
      }
      // Text input so expressions stay possible; numeric text commits a number.
      return (
        <FieldShell
          htmlFor={fieldId}
          prop={prop}
          invalid={invalid}
          picker={picker}
          error={numberError ?? (textMode ? null : rangeError)}
        >
          {textInput({
            mono: textMode,
            placeholder: textMode
              ? "{{expression}} yielding a number"
              : (prop.placeholder ??
                numberRangeText(prop.min, prop.max) ??
                undefined),
            commit: commitNumber,
          })}
        </FieldShell>
      );
    }
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
                  return onCommit(undefined, "MANUAL");
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
      if (prop.display === "cards") {
        return (
          <FieldShell htmlFor={fieldId} prop={prop} invalid={invalid}>
            <OptionCards
              id={fieldId}
              options={options}
              value={value}
              keyOf={stringifyValue}
              onChange={onCommit}
              invalid={invalid}
              clearable={!prop.required}
            />
          </FieldShell>
        );
      }
      // A short either/or reads faster as buttons than as a closed list.
      if (
        !prop.staticDisabled &&
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
            placeholder={prop.staticPlaceholder ?? prop.placeholder}
            disabled={prop.staticDisabled && isEmptyValue(value)}
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
      if (textMode) {
        return (
          <FieldShell
            htmlFor={fieldId}
            prop={prop}
            invalid={invalid}
            picker={
              <>
                {picker}
                <ModeButton
                  label="Pick from list"
                  onClick={() => {
                    // An expression is not an option; keep a plain id.
                    if (hasExpressions(value)) {
                      setTextMode(false);
                      onCommit(undefined, "MANUAL");
                    } else toMode(false);
                  }}
                />
              </>
            }
          >
            {textInput({
              mono: true,
              placeholder: "{{steps.…}} or an id",
              commit: (raw) => onCommit(raw.trim() === "" ? undefined : raw),
            })}
          </FieldShell>
        );
      }
      const result =
        searchResult ??
        (dropdown.state.kind === "ready" ? dropdown.state.result : null);
      const listed = result?.options ?? [];
      const keepPicked =
        picked !== null &&
        stringifyValue(picked.value) === stringifyValue(value) &&
        !listed.some(
          (option) => stringifyValue(option.value) === stringifyValue(value),
        );
      const options = keepPicked ? [...listed, picked] : listed;
      return (
        <FieldShell
          htmlFor={fieldId}
          prop={prop}
          invalid={invalid}
          error={loadError(dropdown.state)}
          picker={optionsUnavailable ? <AvailableSoon /> : picker}
        >
          <OptionSelect
            id={fieldId}
            options={options}
            value={value}
            onChange={(next) => {
              setPicked(
                listed.find(
                  (option) =>
                    stringifyValue(option.value) === stringifyValue(next),
                ) ?? null,
              );
              onCommit(next);
            }}
            invalid={invalid}
            loading={dropdown.state.kind === "loading"}
            disabled={
              (result?.disabled && !stringifyValue(value)) || optionsUnavailable
            }
            onRefresh={dynamicLoad ? dropdown.reload : undefined}
            clearable={!prop.required}
            searchable
            onQueryChange={onSearch}
            actions={[
              {
                label: "Use data from an earlier step",
                icon: "braces",
                onSelect: () => {
                  toMode(true);
                  field.focus();
                },
              },
            ]}
            emptyText={
              result?.placeholder ??
              "Nothing to choose from yet. Some lists need a connection first."
            }
            placeholder={
              optionsUnavailable
                ? "Options for nested fields are available soon"
                : (result?.placeholder ?? prop.placeholder ?? "Choose…")
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
              {props.waitingOn
                ? `Pick ${props.waitingOn} first; its fields show here.`
                : "No properties for the current selection."}
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
      // Bound: one expression yields the whole list.
      if (textMode) {
        return (
          <FieldShell
            htmlFor={fieldId}
            prop={prop}
            invalid={invalid}
            picker={
              <>
                <ExpressionPickerButton
                  active={field.active}
                  onFocusField={field.focus}
                />
                <ModeButton
                  label="Enter items"
                  onClick={() => {
                    setTextMode(false);
                    const bound = stringifyValue(value).trim();
                    onCommit(bound ? [bound] : undefined, "MANUAL");
                  }}
                />
              </>
            }
          >
            {textInput({
              mono: true,
              placeholder: "{{steps.…}} yielding a list",
              commit: (raw) =>
                onCommit(
                  raw.trim() === "" ? undefined : raw.trim(),
                  "EXPRESSION",
                ),
            })}
          </FieldShell>
        );
      }
      // One item per line, each stored as it is.
      const lines = Array.isArray(value)
        ? value.map((item) => stringifyValue(item)).join("\n")
        : stringifyValue(value);
      return (
        <FieldShell
          htmlFor={fieldId}
          prop={prop}
          invalid={invalid}
          picker={
            <>
              <ExpressionPickerButton
                active={field.active}
                onFocusField={field.focus}
              />
              <ModeButton
                label="Bind the whole list"
                onClick={() => {
                  setTextMode(true);
                  onCommit(undefined, "EXPRESSION");
                }}
              />
            </>
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
                  return onCommit(undefined, "MANUAL");
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
    case "DATE_RANGE":
      return (
        <FieldShell htmlFor={fieldId} prop={prop} invalid={invalid}>
          <DateRangeField
            id={fieldId}
            value={value}
            dropdown={prop.display === "dropdown"}
            invalid={invalid}
            clearable={!prop.required}
            onCommit={onCommit}
          />
        </FieldShell>
      );
    case "COLOR":
      return (
        <FieldShell
          htmlFor={fieldId}
          prop={prop}
          invalid={invalid}
          picker={picker}
        >
          <ColorField
            id={fieldId}
            value={value}
            invalid={invalid}
            onCommit={onCommit}
            onFocus={field.focus}
          />
        </FieldShell>
      );
    case "RICH_TEXT":
    case "LONG_TEXT":
    case "CUSTOM":
    case "JSON": {
      // A CUSTOM prop's own renderer is DOM script; its value is edited as JSON.
      const isJson = prop.type === "JSON" || prop.type === "CUSTOM";
      const mode =
        prop.type === "RICH_TEXT"
          ? richTextMode(
              prop.formatProperty ? props.config?.[prop.formatProperty] : "",
            )
          : null;
      return (
        <FieldShell
          htmlFor={fieldId}
          prop={prop}
          invalid={invalid}
          picker={
            mode ? (
              <>
                <span className="rounded bg-muted px-1.5 text-[11px] text-muted-foreground">
                  {mode === "html"
                    ? "HTML"
                    : mode === "markdown"
                      ? "Markdown"
                      : "Plain text"}
                </span>
                {picker}
              </>
            ) : (
              picker
            )
          }
          error={jsonError}
        >
          <textarea
            id={fieldId}
            ref={fieldRef as React.RefObject<HTMLTextAreaElement>}
            className={`${textAreaClass} ${isJson || mode === "html" || prop.display === "code" ? "font-mono text-xs" : ""} ${
              mode ? "min-h-32" : ""
            } ${invalid ? invalidClass : ""}`}
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
          {prop.emptyChoice && value === ""
            ? null
            : textInput({
                commit: (raw) => onCommit(raw === "" ? undefined : raw),
              })}
          {prop.emptyChoice ? (
            <label className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-current"
                checked={value === ""}
                onChange={(event) =>
                  onCommit(event.target.checked ? "" : undefined, "MANUAL")
                }
              />
              {prop.emptyChoice}
            </label>
          ) : null}
        </FieldShell>
      );
  }
}

// Stands in for the block of a form with no resolvers.
const NO_BLOCK: BlockRef = {
  pieceName: "",
  pieceVersion: "",
  kind: "action",
  name: "",
};

export function PropertyForm(props: {
  props: BlockFormProp[];
  // Leads the resolver cache keys; absent for forms with no resolvers.
  block?: BlockRef;
  // The piece's property groups; props outside them render as they are.
  groups?: PropertyGroup[];
  value: Record<string, unknown>;
  // Settings come along when the edit changed them too.
  onChange: (
    next: Record<string, unknown>,
    settings?: PropertySettingModel[],
  ) => void;
  // Per-field mode and DYNAMIC schema; top-level forms only.
  settings?: PropertySettingModel[] | null;
  // Edits carry field modes and resolved DYNAMIC schemas; off when
  // read-only or nested.
  writesSettings?: boolean;
  loadOptions?: (
    propName: string,
    current: Record<string, unknown>,
    searchValue?: string,
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

  const [settings, setSettings] = useState(props.settings ?? null);
  const [prevSettings, setPrevSettings] = useState(props.settings);
  if (props.settings !== prevSettings) {
    setPrevSettings(props.settings);
    setSettings(props.settings ?? null);
  }
  const tracksSettings = props.writesSettings === true;
  const readDynamic = useDynamicCache();

  // Each DYNAMIC prop's children as resolved for `config`, when cached.
  const withResolvedSchemas = (
    list: PropertySettingModel[] | null,
    config: Record<string, unknown>,
  ): PropertySettingModel[] | null => {
    let next = list;
    for (const prop of props.props) {
      if (prop.type !== "DYNAMIC") continue;
      if (settingFor(next, prop.name)?.mode === "EXPRESSION") continue;
      const fields = readDynamic(
        resolverInputFor(
          props.block ?? NO_BLOCK,
          prop,
          config,
          props.connectionId,
        ),
      );
      if (!fields) continue;
      const schema = stripOptions(fields);
      const stored = settingFor(next, prop.name)?.schema ?? null;
      if (JSON.stringify(stored) === JSON.stringify(schema)) continue;
      next = withSetting(next, prop.name, { schema });
    }
    return next;
  };

  const commitField = (
    name: string,
    value: unknown,
    mode?: PropertyModeValue,
  ) => {
    const next = { ...current };
    if (value === undefined) delete next[name];
    else next[name] = value;
    let nextSettings = settings;
    // A touched field always has a mode; layout-driven edits are MANUAL.
    const nextMode = mode ?? settingFor(settings, name)?.mode ?? "MANUAL";
    if (tracksSettings && settingFor(settings, name)?.mode !== nextMode) {
      nextSettings = withSetting(nextSettings, name, { mode: nextMode });
    }
    // A pick made against the old value of a refresher no longer holds.
    if (value !== current[name]) {
      for (const dependent of props.props) {
        if (!dependent.refreshers?.includes(name)) continue;
        if (isDropdownType(dependent.type)) delete next[dependent.name];
        // Its children were resolved for the old value.
        if (
          tracksSettings &&
          dependent.type === "DYNAMIC" &&
          settingFor(nextSettings, dependent.name)?.schema != null
        ) {
          nextSettings = withSetting(nextSettings, dependent.name, {
            schema: null,
          });
        }
      }
    }
    if (tracksSettings) nextSettings = withResolvedSchemas(nextSettings, next);
    setCurrent(next);
    if (nextSettings !== settings) {
      setSettings(nextSettings);
      props.onChange(next, nextSettings ?? []);
    } else props.onChange(next);
  };

  // A mode switch alone is still an edit of the config it belongs to.
  const setMode = (name: string, mode: PropertyModeValue) => {
    if (!tracksSettings || settingFor(settings, name)?.mode === mode) return;
    const next = withResolvedSchemas(
      withSetting(settings, name, { mode }),
      current,
    );
    setSettings(next);
    props.onChange(current, next ?? []);
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
      value={current[prop.name]}
      onCommit={(value, mode) => commitField(prop.name, value, mode)}
      mode={settingFor(settings, prop.name)?.mode}
      onMode={(mode) => setMode(prop.name, mode)}
      loadOptions={
        props.loadOptions
          ? (propName, searchValue) =>
              props.loadOptions!(propName, current, searchValue)
          : undefined
      }
      config={current}
      secrets={props.secrets}
      scopeStepId={props.scopeStepId}
      resolverInput={resolverInputFor(
        props.block ?? NO_BLOCK,
        prop,
        current,
        props.connectionId,
      )}
      waitingOn={
        props.props.find(
          (sibling) =>
            prop.refreshers?.includes(sibling.name) &&
            isEmptyValue(current[sibling.name]),
        )?.displayName
      }
      nested={props.nested}
      webhookUrl={props.webhookUrl}
    />
  );

  return (
    <div className={`flex flex-col ${props.nested ? "gap-4" : "gap-5"}`}>
      <PropLayout
        props={essential}
        groups={props.groups}
        values={current}
        renderField={field}
        onCommit={commitField}
      />
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
            <PropLayout
              props={advanced}
              groups={props.groups}
              values={current}
              renderField={field}
              onCommit={commitField}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
