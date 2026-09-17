// Connection identity and state, in the same shape as the workflow editor's
// toolbar: name, connector, status, and the one destructive action.
import { useEffect, useState } from "react";
import type { ConnectionState } from "document-models/connection";
import {
  fetchPieceCatalog,
  type PieceSummary,
} from "../workflow-editor/runtime-api.js";
import { packageFromConnectorId } from "./piece-auth.js";
import { CONNECTION_STATUS_STYLES } from "./status.js";

export function ConnectionToolbar(props: {
  state: ConnectionState;
  onRename: (name: string) => void;
  onSetStatus: (status: "OK" | "REVOKED") => void;
  onDelete: () => void;
}) {
  const { state } = props;
  const [catalog, setCatalog] = useState<PieceSummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Cached in the runtime client, so this costs nothing the form hasn't paid.
    fetchPieceCatalog().then(
      (pieces) => {
        if (!cancelled) setCatalog(pieces);
      },
      () => {
        if (!cancelled) setCatalog([]);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const packageName = packageFromConnectorId(state.connectorId);
  const piece = catalog?.find((entry) => entry.name === packageName);
  const revoked = state.status === "REVOKED";

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-solid border-slate-200 px-4 py-2">
      <input
        key={state.name}
        className="min-w-0 max-w-72 rounded border border-transparent px-1 py-0.5 text-sm font-semibold text-slate-800 hover:border-slate-200 focus:border-slate-300 focus:outline-none"
        defaultValue={state.name}
        placeholder="Untitled connection"
        spellCheck={false}
        aria-label="Connection name"
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        onBlur={(event) => {
          const name = event.target.value.trim();
          if (name && name !== state.name) props.onRename(name);
        }}
      />
      {piece ? (
        <span className="flex min-w-0 items-center gap-1.5">
          <img
            src={piece.logoUrl}
            alt=""
            className="h-4 w-4 shrink-0 object-contain"
          />
          <span className="truncate text-xs text-slate-600">
            {piece.displayName}
          </span>
        </span>
      ) : packageName ? (
        <span className="truncate text-xs text-slate-400">{packageName}</span>
      ) : (
        <span className="text-xs text-slate-400">No connector picked</span>
      )}
      <span
        className={`rounded px-2 py-0.5 text-[11px] font-semibold ${CONNECTION_STATUS_STYLES[state.status]}`}
      >
        {state.status}
      </span>
      {state.accountLabel ? (
        <span className="truncate text-xs text-slate-500">
          {state.accountLabel}
        </span>
      ) : null}
      <span className="ml-auto flex items-center gap-3">
        {state.lastCheckedAt ? (
          <span
            className="text-[11px] text-slate-400"
            title={new Date(state.lastCheckedAt).toLocaleString()}
          >
            Checked {new Date(state.lastCheckedAt).toLocaleDateString()}
          </span>
        ) : (
          <span className="text-[11px] text-slate-400">Never checked</span>
        )}
        <button
          type="button"
          className="rounded border border-solid border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:border-slate-400 hover:bg-slate-50"
          onClick={() => props.onSetStatus(revoked ? "OK" : "REVOKED")}
        >
          {revoked ? "Reactivate" : "Revoke"}
        </button>
        <button
          type="button"
          className="rounded border border-solid border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-600 hover:border-red-300 hover:bg-red-50"
          onClick={props.onDelete}
        >
          Delete
        </button>
      </span>
    </div>
  );
}
