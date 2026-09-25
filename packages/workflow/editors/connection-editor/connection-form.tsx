// Presentation for the connection editor: connector picker driven by the
// piece catalog, auth form driven by the piece's PieceAuth descriptor.
import { useEffect, useId, useState } from "react";
import type {
  ConnectionState,
  ConnectionStatus,
} from "document-models/connection";
import {
  createSecret,
  fetchPieceCatalog,
  fetchSecretStat,
  rotateSecret,
  type PieceSummary,
  type SecretStat,
} from "../workflow-editor/runtime-api.js";
import { formatWhen } from "../workflow-studio/components/run-format.js";
import { Icon } from "../shared/icons.js";
import {
  Button,
  FieldError,
  FieldLabel as LabelRow,
  Hint as HintText,
  IconButton,
  Select,
  Switch,
  textInputClass,
} from "../shared/controls.js";
import {
  isAuthComplete,
  packageFromConnectorId,
  planFromAuth,
  type AuthField,
  type AuthPlan,
} from "./piece-auth.js";

export interface ConnectionCallbacks {
  setName: (name: string) => void;
  pickPiece: (piece: PieceSummary) => void;
  setConfigValue: (name: string, value: unknown) => void;
  setSecretRef: (name: string, ref: string) => void;
  removeSecretRef: (name: string) => void;
  setStatus: (status: ConnectionStatus) => void;
}

const inputClass = textInputClass;

function FieldLabel(props: { field: AuthField }) {
  return (
    <LabelRow
      label={props.field.displayName}
      optional={!props.field.required}
    />
  );
}

function Hint(props: { children?: string }) {
  return <HintText text={props.children ?? ""} />;
}

function ConfigField(props: {
  field: AuthField;
  value: unknown;
  onCommit: (value: unknown) => void;
}) {
  const { field, value } = props;
  if (field.inputType === "CHECKBOX") {
    return (
      <Switch
        checked={Boolean(value)}
        onChange={(checked) => props.onCommit(checked)}
        label={field.displayName}
        description={field.description}
      />
    );
  }
  if (field.inputType === "STATIC_DROPDOWN") {
    return (
      <div>
        <FieldLabel field={field} />
        <Select
          value={typeof value === "string" ? value : ""}
          options={(field.options ?? []).map((option) => ({
            value: String(option.value),
            label: option.label,
          }))}
          clearable={!field.required}
          onChange={(next) => props.onCommit(next || undefined)}
        />
        <Hint>{field.description}</Hint>
      </div>
    );
  }
  return (
    <label className="block">
      <FieldLabel field={field} />
      <input
        className={inputClass}
        type={field.inputType === "NUMBER" ? "number" : "text"}
        defaultValue={
          typeof value === "string" || typeof value === "number" ? value : ""
        }
        spellCheck={false}
        onBlur={(event) => {
          const raw = event.target.value.trim();
          if (raw === "") props.onCommit(undefined);
          else if (field.inputType === "NUMBER") props.onCommit(Number(raw));
          else props.onCommit(raw);
        }}
      />
      <Hint>{field.description}</Hint>
    </label>
  );
}

const SECRET_REF_PREFIX = "secret://v1:";

function isManagedRef(ref: string): boolean {
  return ref.startsWith(SECRET_REF_PREFIX);
}

// Undefined while the stat loads; null when the ref doesn't resolve.
function useSecretStat(refValue: string) {
  const [stat, setStat] = useState<SecretStat | null | undefined>(undefined);
  useEffect(() => {
    // eslint-disable-next-line react-hooks-extra/set-state-in-effect -- clears the stale stat before the ref's own fetch
    setStat(isManagedRef(refValue) ? undefined : null);
    if (!isManagedRef(refValue)) return;
    let cancelled = false;
    fetchSecretStat(refValue).then(
      (result) => {
        if (!cancelled) setStat(result);
      },
      () => {
        if (!cancelled) setStat(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [refValue]);
  return [stat, setStat] as const;
}

function SavedSecret(props: {
  stat: SecretStat | undefined;
  fresh: boolean;
  onReplace: () => void;
  onRemove: () => void;
}) {
  const { stat, fresh } = props;
  return (
    <div
      className="flex items-center gap-3 rounded-lg border border-solid border-foreground/10 bg-muted/40 px-3 py-2.5"
      title={stat?.label ?? undefined}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-wf-ok/12 text-wf-ok">
        <Icon name="lock" className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span
          aria-hidden
          className="block font-mono text-sm leading-5 tracking-[0.08em] text-foreground"
        >
          ••••••••••••
        </span>
        <span className="block text-xs text-muted-foreground">
          {stat === undefined ? (
            "Checking the saved value…"
          ) : fresh ? (
            <span className="inline-flex items-center gap-1 font-medium text-wf-ok">
              <Icon name="check" className="h-3 w-3" />
              Saved just now
            </span>
          ) : (
            <span title={new Date(stat.updatedAt).toLocaleString()}>
              Saved {formatWhen(stat.updatedAt)}
              {stat.version > 1 ? `, version ${stat.version}` : ""}
            </span>
          )}
        </span>
      </span>
      <Button size="sm" onClick={props.onReplace}>
        Replace
      </Button>
      <IconButton
        icon="trash"
        label="Remove saved value"
        onClick={props.onRemove}
      />
    </div>
  );
}

// The input takes the VALUE; only the minted ref ever enters the document.
// A stored secret is replaced by rotating it in place unless asked otherwise.
function SecretField(props: {
  field: AuthField;
  refValue: string;
  connectionName: string;
  onCommit: (ref: string) => void;
  onRemove: () => void;
}) {
  const { field, refValue } = props;
  const inputId = useId();
  const managed = isManagedRef(refValue);
  const [stat, setStat] = useSecretStat(refValue);
  const [value, setValue] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  // Mints a new ref instead of rotating the existing one.
  const [separate, setSeparate] = useState(false);

  const stored = managed && stat !== null && stat?.status !== "DELETED";
  const problem = !refValue
    ? null
    : stat?.status === "DELETED"
      ? "The saved value was deleted on the switchboard. Paste a new one."
      : stat === null
        ? "The saved reference no longer resolves. Paste the value again."
        : null;
  const showEditor = !stored || editing;

  const cancel = () => {
    setValue("");
    setError(null);
    setEditing(false);
    setReveal(false);
  };

  const save = () => {
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    const label = `${props.connectionName || "connection"} · ${field.displayName}`;
    const request =
      stored && !separate
        ? rotateSecret(refValue, value)
        : createSecret(value, label);
    request
      .then((result) => {
        cancel();
        setJustSaved(true);
        if (result.ref !== refValue) props.onCommit(result.ref);
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

  return (
    <div>
      <LabelRow
        htmlFor={showEditor ? inputId : undefined}
        label={field.displayName}
        optional={!field.required}
        needsValue={field.required && !stored}
        action={
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            aria-expanded={advanced}
            onClick={() => setAdvanced((open) => !open)}
          >
            {advanced ? "Hide reference" : "Reference"}
          </button>
        }
      />
      {stored && !editing ? (
        <SavedSecret
          stat={stat}
          fresh={justSaved}
          onReplace={() => {
            setJustSaved(false);
            setEditing(true);
          }}
          onRemove={props.onRemove}
        />
      ) : null}
      {problem ? (
        <p className="mb-2 flex items-start gap-2 rounded-md bg-wf-warn/10 px-3 py-2 text-xs text-wf-warn">
          <Icon name="alert" className="mt-px h-3.5 w-3.5" />
          {problem}
        </p>
      ) : null}
      {showEditor ? (
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <input
              id={inputId}
              className={`${inputClass} pr-9 ${value && !reveal ? "font-mono tracking-wider" : ""}`}
              type={reveal ? "text" : "password"}
              value={value}
              disabled={busy}
              autoFocus={editing}
              placeholder={
                stored
                  ? `Paste the new ${field.displayName.toLowerCase()}`
                  : `Paste the ${field.displayName.toLowerCase()}`
              }
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") save();
                if (event.key === "Escape" && editing) cancel();
              }}
            />
            <span className="absolute inset-y-0 right-1 flex items-center">
              <IconButton
                icon={reveal ? "eyeOff" : "eye"}
                label={`${reveal ? "Hide" : "Show"} ${field.displayName}`}
                onClick={() => setReveal((shown) => !shown)}
              />
            </span>
          </div>
          <Button
            variant="primary"
            aria-label={`Save ${field.displayName}`}
            disabled={!value || busy}
            onClick={save}
          >
            {busy ? "Saving…" : "Save"}
          </Button>
          {editing ? (
            <Button variant="ghost" onClick={cancel}>
              Cancel
            </Button>
          ) : null}
          {problem ? (
            <IconButton
              icon="trash"
              label="Remove saved value"
              onClick={props.onRemove}
            />
          ) : null}
        </div>
      ) : null}
      <FieldError>{error}</FieldError>
      <Hint>{field.description}</Hint>
      {advanced ? (
        <div className="mt-3 flex flex-col gap-3 rounded-lg border border-dashed border-foreground/15 px-3 py-3">
          <div>
            <LabelRow htmlFor={`${inputId}-ref`} label="Secret reference" />
            <input
              id={`${inputId}-ref`}
              key={refValue}
              className={`${inputClass} font-mono text-xs`}
              defaultValue={refValue}
              placeholder="secret://v1:…"
              spellCheck={false}
              onBlur={(event) => {
                const ref = event.target.value.trim();
                if (!ref || ref === refValue) return;
                if (!isManagedRef(ref)) {
                  setError(
                    "Only secret://v1: references resolve. To store a value, paste it above instead.",
                  );
                  return;
                }
                setError(null);
                props.onCommit(ref);
              }}
            />
            <HintText text="Point at a secret that already exists on the switchboard, for example one shared with another connection." />
          </div>
          {stored ? (
            <Switch
              checked={separate}
              onChange={setSeparate}
              label="Save replacements as a separate secret"
              description="Leaves the current secret untouched for anything else that uses it, instead of adding a new version."
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ConnectionForm(props: {
  state: ConnectionState;
  callbacks: ConnectionCallbacks;
}) {
  const { state, callbacks } = props;
  const [catalog, setCatalog] = useState<PieceSummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPieceCatalog()
      .then((pieces) => {
        if (!cancelled) setCatalog(pieces);
      })
      .catch(() => {
        if (!cancelled) setCatalog([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const packageName = packageFromConnectorId(state.connectorId);
  const piece = catalog?.find((entry) => entry.name === packageName);
  // Descriptor plan when the piece is known; otherwise reconstruct enough
  // from state so existing refs stay editable.
  const plan: AuthPlan = piece
    ? planFromAuth(piece.auth)
    : {
        authType: state.authType,
        configFields: [],
        secretFields: state.secretRefs.map((ref) => ({
          name: ref.name,
          displayName: ref.name,
          required: false,
        })),
        supported: state.authType !== "OAUTH2" && state.authType !== "OIDC",
      };

  const config = (state.config ?? {}) as Record<string, unknown>;
  const refByName = new Map(state.secretRefs.map((ref) => [ref.name, ref.ref]));

  // Recomputed on every edit: promotes UNCONFIGURED to OK, and demotes back
  // when a required field is cleared. REVOKED/ERROR are left alone.
  const maybeMarkConfigured = (
    nextConfig: Record<string, unknown>,
    nextRefs: Map<string, string>,
  ) => {
    if (!plan.supported) return;
    const complete = isAuthComplete(plan, nextConfig, nextRefs);
    if (complete && state.status === "UNCONFIGURED") {
      callbacks.setStatus("OK");
    } else if (!complete && state.status === "OK") {
      callbacks.setStatus("UNCONFIGURED");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <LabelRow label="Service" />
        <Select
          value={packageName}
          loading={catalog === null}
          placeholder="Choose the service to connect"
          options={(catalog ?? []).map((entry) => ({
            value: entry.name,
            label: entry.displayName,
            description: entry.description,
            icon: entry.logoUrl ? (
              <img
                src={entry.logoUrl}
                alt=""
                loading="lazy"
                className="h-4 w-4 shrink-0 object-contain"
              />
            ) : undefined,
          }))}
          onChange={(name) => {
            const picked = catalog?.find((entry) => entry.name === name);
            if (picked) callbacks.pickPiece(picked);
          }}
        />
        {piece ? <HintText text={piece.description} /> : null}
      </div>

      {plan.supported ? null : (
        <p className="rounded-md bg-wf-warn/10 px-3 py-2 text-xs text-wf-warn">
          {plan.authType} connections are not executable by the workflow runtime
          yet.
        </p>
      )}

      {plan.configFields.length > 0 ? (
        <div className="flex flex-col gap-5 border-t border-solid border-foreground/10 pt-5">
          <h3 className="text-[13px] font-semibold text-foreground">
            Configuration
          </h3>
          {plan.configFields.map((field) => (
            <ConfigField
              key={field.name}
              field={field}
              value={config[field.name]}
              onCommit={(value) => {
                callbacks.setConfigValue(field.name, value);
                maybeMarkConfigured(
                  { ...config, [field.name]: value },
                  refByName,
                );
              }}
            />
          ))}
        </div>
      ) : null}

      {plan.secretFields.length > 0 ? (
        <div className="flex flex-col gap-5 border-t border-solid border-foreground/10 pt-5">
          <div>
            <h3 className="text-[13px] font-semibold text-foreground">
              Credentials
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Saved encrypted on the switchboard. This connection only keeps a
              reference, so nobody reading it can see the values.
            </p>
          </div>
          {plan.secretFields.map((field) => (
            <SecretField
              key={field.name}
              field={field}
              connectionName={state.name}
              refValue={refByName.get(field.name) ?? ""}
              onCommit={(ref) => {
                callbacks.setSecretRef(field.name, ref);
                const nextRefs = new Map(refByName);
                nextRefs.set(field.name, ref);
                maybeMarkConfigured(config, nextRefs);
              }}
              onRemove={() => {
                callbacks.removeSecretRef(field.name);
                const nextRefs = new Map(refByName);
                nextRefs.delete(field.name);
                maybeMarkConfigured(config, nextRefs);
              }}
            />
          ))}
        </div>
      ) : null}

      {state.lastError ? (
        <p className="rounded-md bg-wf-fail/10 px-3 py-2 text-xs text-wf-fail">
          {state.lastError}
        </p>
      ) : null}
    </div>
  );
}
