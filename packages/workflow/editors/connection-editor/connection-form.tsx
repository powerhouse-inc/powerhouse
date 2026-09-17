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
import { AutocompleteInput } from "../workflow-editor/ui/Autocomplete.js";
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

const inputClass =
  "w-full rounded border border-solid border-slate-300 px-2 py-1.5 text-sm text-slate-800";

function FieldLabel(props: { field: AuthField }) {
  return (
    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
      {props.field.displayName}
      {props.field.required ? <span className="text-red-500"> *</span> : null}
    </span>
  );
}

function Hint(props: { children?: string }) {
  if (!props.children) return null;
  return <p className="mt-0.5 text-[11px] text-slate-400">{props.children}</p>;
}

function ConfigField(props: {
  field: AuthField;
  value: unknown;
  onCommit: (value: unknown) => void;
}) {
  const { field, value } = props;
  if (field.inputType === "CHECKBOX") {
    return (
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => props.onCommit(event.target.checked)}
        />
        {field.displayName}
      </label>
    );
  }
  if (field.inputType === "STATIC_DROPDOWN") {
    return (
      <label className="block">
        <FieldLabel field={field} />
        <select
          className={inputClass}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => props.onCommit(event.target.value || undefined)}
        >
          <option value="">—</option>
          {(field.options ?? []).map((option) => (
            <option key={String(option.value)} value={String(option.value)}>
              {option.label}
            </option>
          ))}
        </select>
        <Hint>{field.description}</Hint>
      </label>
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clears the stale stat before the ref's own fetch
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
        <p className="mb-1 text-[11px] text-slate-500">
          <span className="font-medium text-slate-600">
            {stat?.label ?? refValue}
          </span>
          {stat ? (
            <span>
              {" "}
              · v{stat.version} · rotated{" "}
              {new Date(stat.updatedAt).toLocaleString()}
            </span>
          ) : null}
          {stat?.status === "DELETED" ? (
            <span className="font-medium text-red-600"> · deleted</span>
          ) : null}
        </p>
      ) : null}
      {refValue && !managed ? (
        <p className="mb-1 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
          Legacy ref <span className="font-mono">{refValue}</span> no longer
          resolves. Paste the secret value to replace it with a managed secret.
        </p>
      ) : null}
      <div className="flex gap-1">
        <input
          className={inputClass}
          type="password"
          value={value}
          disabled={busy}
          placeholder={
            managed
              ? replace
                ? "Paste a value for the replacement secret"
                : "•••••••• — paste a new value to rotate"
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
          <button
            type="button"
            className="shrink-0 rounded border border-solid border-slate-200 px-2 text-xs text-slate-400 hover:text-red-500"
            title="Remove secret ref"
            onClick={props.onRemove}
          >
            ✕
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="mt-0.5 text-[11px] font-medium text-red-600">{error}</p>
      ) : null}
      <div className="mt-0.5 flex gap-3">
        {managed ? (
          <button
            type="button"
            className="text-[11px] text-slate-400 underline hover:text-slate-600"
            onClick={() => setReplace((mode) => !mode)}
          >
            {replace
              ? "Rotate the existing secret instead"
              : "Replace with a different secret"}
          </button>
        ) : null}
        <button
          type="button"
          className="text-[11px] text-slate-400 underline hover:text-slate-600"
          onClick={() => setManualRef((mode) => !mode)}
        >
          {manualRef ? "Hide ref" : "Enter a ref manually"}
        </button>
      </div>
      {manualRef ? (
        <input
          className={`${inputClass} mt-1 font-mono text-xs`}
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
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Connector
        </span>
        <AutocompleteInput
          value={packageName}
          placeholder="Pick a piece, e.g. @activepieces/piece-slack"
          onCommit={() => undefined}
          onPick={(option) => {
            const picked = catalog?.find(
              (entry) => entry.name === option.value,
            );
            if (picked) callbacks.pickPiece(picked);
          }}
          loadOptions={() =>
            fetchPieceCatalog().then((pieces) => ({
              options: pieces.map((entry) => ({
                label: entry.displayName,
                value: entry.name,
              })),
            }))
          }
        />
        {piece ? (
          <div className="mt-2 flex items-center gap-2 rounded border border-solid border-slate-200 bg-slate-50 p-2">
            <img
              src={piece.logoUrl}
              alt={piece.displayName}
              className="h-8 w-8 object-contain"
            />
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-800">
                {piece.displayName}
              </div>
              <div className="truncate text-xs text-slate-400">
                {plan.displayName ?? plan.authType} · {piece.description}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {plan.supported ? null : (
        <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {plan.authType} connections are not executable by the workflow runtime
          yet.
        </p>
      )}

      {plan.configFields.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-slate-700">
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
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-slate-700">Secrets</h3>
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
        <p className="rounded bg-red-50 px-3 py-2 text-xs text-red-600">
          {state.lastError}
        </p>
      ) : null}
    </div>
  );
}
