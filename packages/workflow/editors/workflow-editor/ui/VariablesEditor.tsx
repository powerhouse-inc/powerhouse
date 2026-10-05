// Workflow-level variables: typed name/value rows exposed to expressions as
// {{variables.<name>}}. The value is parsed by its type, never guessed.
import { useId, useState } from "react";
import {
  Button,
  FieldError,
  IconButton,
  Select,
  Switch,
  textAreaClass,
  textInputClass,
} from "../../shared/controls.js";
import { useDesignTime } from "./design-time.js";
import type { SecretFormService } from "./forms.js";
import type {
  VariableModel,
  VariableTypeValue,
  WorkflowEditorCallbacks,
} from "./model.js";
import { useSecretRef } from "./secret-ref.js";
import {
  convertVariableValue,
  parseTypedValue,
  valueMismatch,
  VARIABLE_TYPE_LABEL,
  VARIABLE_TYPES,
} from "./variable-types.js";

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

const TYPE_OPTIONS = VARIABLE_TYPES.map((type) => ({
  value: type,
  label: VARIABLE_TYPE_LABEL[type],
}));

// A row written before types were stored reads as text.
const typeOf = (variable: VariableModel): VariableTypeValue =>
  variable.type ?? "TEXT";

function stringifyValue(value: unknown, pretty = false): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, pretty ? 2 : undefined);
  } catch {
    return String(value as number | boolean);
  }
}

function SecretValue(props: {
  variable: VariableModel;
  secrets?: SecretFormService;
  onCommit: (ref: string | null) => void;
}) {
  const id = useId();
  const secret = useSecretRef({
    value: props.variable.value,
    secrets: props.secrets,
    label: `Variable ${props.variable.key}`,
    onCommit: props.onCommit,
  });
  if (!props.secrets) {
    return (
      <p className="text-xs text-muted-foreground">
        Managed secrets are unavailable in this session.
      </p>
    );
  }
  return (
    <div>
      {secret.managed ? (
        <p className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {secret.stat?.label ?? "Stored secret"}
          </span>
          {secret.stat ? <span>version {secret.stat.version}</span> : null}
        </p>
      ) : null}
      <div className="flex items-center gap-1">
        <input
          id={id}
          aria-label={`Value of ${props.variable.key}`}
          className={textInputClass}
          type="password"
          value={secret.draft}
          disabled={secret.busy}
          placeholder={
            secret.managed
              ? "Paste a new value to replace it"
              : "Paste the secret value"
          }
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => secret.setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") secret.commit();
          }}
          onBlur={secret.commit}
        />
        {secret.ref ? (
          <IconButton
            icon="close"
            label="Remove secret"
            onClick={() => props.onCommit(null)}
          />
        ) : null}
      </div>
      <FieldError>{secret.error}</FieldError>
    </div>
  );
}

function ValueControl(props: {
  variable: VariableModel;
  commit: (value: unknown) => void;
}) {
  const { variable } = props;
  const type = typeOf(variable);
  const designTime = useDesignTime();
  const [error, setError] = useState<string | null>(null);
  const label = `Value of ${variable.key}`;
  const mismatch = valueMismatch(type, variable.value);

  if (type === "SECRET") {
    return (
      <SecretValue
        variable={variable}
        secrets={designTime?.secrets}
        onCommit={props.commit}
      />
    );
  }
  if (type === "BOOLEAN" && !mismatch) {
    return (
      <Switch
        checked={variable.value === true}
        onChange={(checked) => props.commit(checked)}
        label={variable.value === true ? "True" : "False"}
      />
    );
  }
  const json = type === "JSON";
  const commitText = (raw: string) => {
    const parsed = parseTypedValue(type, raw);
    if (!parsed.ok) return setError(parsed.error);
    setError(null);
    if (stringifyValue(parsed.value) !== stringifyValue(variable.value)) {
      props.commit(parsed.value);
    }
  };
  const shown = error ?? mismatch;
  const common = {
    "aria-label": label,
    "aria-invalid": shown ? true : undefined,
    defaultValue: stringifyValue(variable.value, json),
    placeholder: type === "NUMBER" ? "0" : "value",
    spellCheck: false,
  };
  return (
    <div>
      {json ? (
        <textarea
          key={`${variable.id}-${stringifyValue(variable.value)}`}
          {...common}
          className={`${textAreaClass} font-mono text-xs`}
          onBlur={(event) => commitText(event.target.value)}
        />
      ) : (
        <input
          key={`${variable.id}-${stringifyValue(variable.value)}`}
          {...common}
          inputMode={type === "NUMBER" ? "decimal" : undefined}
          className={`${textInputClass} font-mono text-xs`}
          onBlur={(event) => commitText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
      )}
      <FieldError>{shown}</FieldError>
    </div>
  );
}

function VariableRow(props: {
  variable: VariableModel;
  callbacks: WorkflowEditorCallbacks;
}) {
  const { variable, callbacks } = props;
  const type = typeOf(variable);
  const set = (value: unknown, nextType: VariableTypeValue = type) =>
    callbacks.setVariable({
      id: variable.id,
      key: variable.key,
      value,
      type: nextType,
    });
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-solid border-foreground/10 bg-card p-3">
      <div className="flex items-center gap-2">
        <code
          className="min-w-0 flex-1 truncate font-mono text-xs font-medium text-foreground"
          title="Keys are fixed once created; remove and re-add to rename"
        >
          {variable.key}
        </code>
        <div className="w-44">
          <Select
            ariaLabel={`Type of ${variable.key}`}
            value={type}
            options={TYPE_OPTIONS}
            onChange={(next) => {
              const nextType = next as VariableTypeValue;
              set(
                convertVariableValue(variable.value, type, nextType),
                nextType,
              );
            }}
          />
        </div>
        <IconButton
          icon="trash"
          label={`Remove ${variable.key}`}
          onClick={() => callbacks.removeVariable(variable.id)}
        />
      </div>
      <ValueControl
        key={type}
        variable={variable}
        commit={(value) => set(value)}
      />
    </div>
  );
}

export function VariablesEditor(props: {
  variables: VariableModel[];
  callbacks: WorkflowEditorCallbacks;
  onClose: () => void;
}) {
  const [key, setKey] = useState("");
  const [type, setType] = useState<VariableTypeValue>("TEXT");
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
  // A secret's value goes in through its row, never through this form.
  const parsed =
    type === "SECRET"
      ? ({ ok: true, value: null } as const)
      : parseTypedValue(type, value);
  const valueError = parsed.ok || value.trim() === "" ? null : parsed.error;
  const canAdd = trimmedKey !== "" && keyError === null && parsed.ok;
  const add = () => {
    if (!canAdd) return;
    props.callbacks.setVariable({ key: trimmedKey, value: parsed.value, type });
    setKey("");
    setValue("");
  };

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Variables</h3>
        <IconButton icon="close" label="Close" onClick={props.onClose} />
      </div>
      <p className="text-xs text-muted-foreground">
        Reference a variable in any step field as{" "}
        <code className="font-mono">{"{{variables.name}}"}</code>. Secrets are
        stored in the secret store; the workflow keeps only a reference.
      </p>
      {props.variables.length === 0 ? (
        <p className="text-xs text-muted-foreground">No variables yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {props.variables.map((variable) => (
            <VariableRow
              key={variable.id}
              variable={variable}
              callbacks={props.callbacks}
            />
          ))}
        </div>
      )}
      <div className="flex flex-col gap-2 rounded-lg border border-dashed border-foreground/15 p-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <input
              aria-label="New variable name"
              className={`${textInputClass} font-mono text-xs`}
              placeholder="new_variable"
              value={key}
              spellCheck={false}
              onChange={(event) => setKey(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") add();
              }}
            />
            <FieldError>{keyError}</FieldError>
          </div>
          <div className="w-36">
            <Select
              ariaLabel="New variable type"
              value={type}
              options={TYPE_OPTIONS}
              onChange={(next) => setType(next as VariableTypeValue)}
            />
          </div>
        </div>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {type === "SECRET" ? (
              <p className="py-2 text-xs text-muted-foreground">
                Paste the secret once the variable is added.
              </p>
            ) : (
              <input
                aria-label="New variable value"
                className={`${textInputClass} font-mono text-xs`}
                placeholder={type === "BOOLEAN" ? "true or false" : "value"}
                value={value}
                spellCheck={false}
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") add();
                }}
              />
            )}
            <FieldError>{valueError}</FieldError>
          </div>
          <Button variant="primary" disabled={!canAdd} onClick={add}>
            Add
          </Button>
        </div>
      </div>
    </div>
  );
}
