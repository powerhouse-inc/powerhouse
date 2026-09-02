// Presentation for the connection editor: connector picker driven by the
// piece catalog, auth form driven by the piece's PieceAuth descriptor.
import { useEffect, useState } from "react";
import type {
  ConnectionState,
  ConnectionStatus,
} from "document-models/connection";
import {
  fetchPieceCatalog,
  type PieceSummary,
} from "../workflow-editor/runtime-api.js";
import { AutocompleteInput } from "../workflow-editor/ui/Autocomplete.js";
import {
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

const STATUS_STYLES: Record<ConnectionStatus, string> = {
  OK: "bg-green-100 text-green-700",
  ERROR: "bg-red-100 text-red-700",
  REVOKED: "bg-slate-200 text-slate-500",
  UNCONFIGURED: "bg-amber-100 text-amber-700",
};

function StatusChip(props: { status: ConnectionStatus }) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[props.status]}`}
    >
      {props.status}
    </span>
  );
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

function SecretField(props: {
  field: AuthField;
  refValue: string;
  onCommit: (ref: string) => void;
  onRemove: () => void;
}) {
  return (
    <label className="block">
      <FieldLabel field={props.field} />
      <div className="flex gap-1">
        <input
          className={`${inputClass} font-mono text-xs`}
          defaultValue={props.refValue}
          placeholder="ENV_VAR_NAME"
          spellCheck={false}
          onBlur={(event) => {
            const ref = event.target.value.trim();
            if (ref && ref !== props.refValue) props.onCommit(ref);
          }}
        />
        {props.refValue ? (
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
      <Hint>
        {props.field.description ??
          "Name of the environment variable on the switchboard host that holds this secret. The value never enters the document."}
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

  return (
    <div className="flex flex-col gap-6">
      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Connection name
        </span>
        <input
          className={inputClass}
          defaultValue={state.name}
          placeholder="e.g. Team Slack workspace"
          onBlur={(event) => {
            const name = event.target.value.trim();
            if (name && name !== state.name) callbacks.setName(name);
          }}
        />
      </label>

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
              onCommit={(value) => callbacks.setConfigValue(field.name, value)}
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
              refValue={refByName.get(field.name) ?? ""}
              onCommit={(ref) => callbacks.setSecretRef(field.name, ref)}
              onRemove={() => callbacks.removeSecretRef(field.name)}
            />
          ))}
        </div>
      ) : null}

      <div className="flex items-center gap-3 border-t border-solid border-slate-100 pt-4">
        <StatusChip status={state.status} />
        {state.lastCheckedAt ? (
          <span className="text-xs text-slate-400">
            checked {new Date(state.lastCheckedAt).toLocaleString()}
          </span>
        ) : null}
        <span className="grow" />
        {state.status === "REVOKED" ? (
          <button
            type="button"
            className="rounded border border-solid border-slate-300 px-2 py-1 text-xs text-slate-600"
            onClick={() => callbacks.setStatus("OK")}
          >
            Reactivate
          </button>
        ) : (
          <button
            type="button"
            className="rounded border border-solid border-slate-300 px-2 py-1 text-xs text-red-600"
            onClick={() => callbacks.setStatus("REVOKED")}
          >
            Revoke
          </button>
        )}
      </div>
      {state.lastError ? (
        <p className="rounded bg-red-50 px-3 py-2 text-xs text-red-600">
          {state.lastError}
        </p>
      ) : null}
    </div>
  );
}
