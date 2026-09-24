// Presentation for the connection editor: connector picker driven by the
// piece catalog, auth form driven by the piece's PieceAuth descriptor.
import { useEffect, useState } from "react";
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
import {
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

// The input takes the VALUE; only the minted ref ever enters the document.
// No ref: paste creates a secret. Managed ref: paste rotates in place.
function SecretField(props: {
  field: AuthField;
  refValue: string;
  connectionName: string;
  onCommit: (ref: string) => void;
  onRemove: () => void;
}) {
  const { field, refValue } = props;
  const managed = isManagedRef(refValue);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stat, setStat] = useState<SecretStat | null>(null);
  // "Replace" mints a new ref instead of rotating the existing one.
  const [replace, setReplace] = useState(false);
  const [manualRef, setManualRef] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks-extra/set-state-in-effect -- clears the stale stat before the ref's own fetch
    setStat(null);
    if (!isManagedRef(refValue)) return;
    let cancelled = false;
    fetchSecretStat(refValue).then(
      (result) => {
        if (!cancelled) setStat(result);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [refValue]);

  const commitValue = () => {
    const secretValue = value;
    if (!secretValue || busy) return;
    setBusy(true);
    setError(null);
    const label = `${props.connectionName || "connection"} · ${field.displayName}`;
    const request =
      managed && !replace
        ? rotateSecret(refValue, secretValue)
        : createSecret(secretValue, label);
    request
      .then((result) => {
        setValue("");
        setReplace(false);
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
    <label className="block">
      <FieldLabel field={field} />
      {managed ? (
        <p className="mb-1.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {stat?.label ?? refValue}
          </span>
          {stat ? (
            <span>
              version {stat.version}, changed{" "}
              {new Date(stat.updatedAt).toLocaleString()}
            </span>
          ) : null}
          {stat?.status === "DELETED" ? (
            <span className="font-medium text-wf-fail">deleted</span>
          ) : null}
        </p>
      ) : null}
      {refValue && !managed ? (
        <p className="mb-1.5 rounded-md bg-wf-warn/10 px-3 py-2 text-xs text-wf-warn">
          Legacy ref <span className="font-mono">{refValue}</span> no longer
          resolves. Paste the secret value to replace it with a managed secret.
        </p>
      ) : null}
      <div className="flex items-center gap-1">
        <input
          className={inputClass}
          type="password"
          value={value}
          disabled={busy}
          placeholder={
            managed
              ? replace
                ? "Paste a value for the replacement secret"
                : "Paste a new value to replace it"
              : "Paste the secret value"
          }
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") commitValue();
          }}
          onBlur={commitValue}
        />
        {refValue ? (
          <IconButton
            icon="close"
            label="Remove secret"
            onClick={props.onRemove}
          />
        ) : null}
      </div>
      <FieldError>{error}</FieldError>
      <div className="mt-1.5 flex gap-3">
        {managed ? (
          <button
            type="button"
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            onClick={() => setReplace((mode) => !mode)}
          >
            {replace
              ? "Rotate the existing secret instead"
              : "Replace with a different secret"}
          </button>
        ) : null}
        <button
          type="button"
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          onClick={() => setManualRef((mode) => !mode)}
        >
          {manualRef ? "Hide ref" : "Enter a ref manually"}
        </button>
      </div>
      {manualRef ? (
        <input
          className={`${inputClass} mt-1.5 font-mono text-xs`}
          defaultValue={refValue}
          placeholder="secret://v1:…"
          spellCheck={false}
          onBlur={(event) => {
            const ref = event.target.value.trim();
            if (ref && ref !== refValue) {
              if (!isManagedRef(ref)) {
                setError(
                  "Only secret://v1: refs resolve. If this is a secret value, paste it in the field above instead.",
                );
                return;
              }
              props.onCommit(ref);
            }
          }}
        />
      ) : null}
      <Hint>
        {field.description ??
          "The value is stored encrypted on the switchboard; the document only carries a reference to it."}
      </Hint>
    </label>
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
          <h3 className="text-[13px] font-semibold text-foreground">Secrets</h3>
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
