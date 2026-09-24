// Connection identity and state, in the same shape as the workflow editor's
// toolbar: name, connector, status, and the one destructive action.
import { useEffect, useState } from "react";
import type { ConnectionState } from "document-models/connection";
import {
  fetchPieceCatalog,
  type PieceSummary,
} from "../workflow-editor/runtime-api.js";
import { packageFromConnectorId } from "./piece-auth.js";
import { Button } from "../shared/controls.js";
import { CONNECTION_STATUS_LABEL, CONNECTION_STATUS_STYLES } from "./status.js";

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
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-solid border-foreground/10 px-4 py-2">
      <input
        key={state.name}
        className="min-w-0 max-w-72 rounded-md border border-solid border-transparent bg-transparent px-1.5 py-1 text-[15px] font-semibold text-foreground hover:border-foreground/15 focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/25"
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
          <span className="truncate text-xs text-muted-foreground">
            {piece.displayName}
          </span>
        </span>
      ) : packageName ? (
        <span className="truncate text-xs text-muted-foreground/80">
          {packageName}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground/80">
          No connector picked
        </span>
      )}
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${CONNECTION_STATUS_STYLES[state.status]}`}
      >
        {CONNECTION_STATUS_LABEL[state.status]}
      </span>
      {state.accountLabel ? (
        <span className="truncate text-xs text-muted-foreground">
          {state.accountLabel}
        </span>
      ) : null}
      <span className="ml-auto flex items-center gap-3">
        {state.lastCheckedAt ? (
          <span
            className="text-xs text-muted-foreground"
            title={new Date(state.lastCheckedAt).toLocaleString()}
          >
            Checked {new Date(state.lastCheckedAt).toLocaleDateString()}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Never checked</span>
        )}
        <Button size="sm" variant="danger" onClick={props.onDelete}>
          Delete
        </Button>
        <Button
          size="sm"
          onClick={() => props.onSetStatus(revoked ? "OK" : "REVOKED")}
        >
          {revoked ? "Reactivate" : "Revoke"}
        </Button>
      </span>
    </div>
  );
}
