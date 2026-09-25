// Connection identity and state, in the same shape as the workflow editor's
// toolbar: name, connector, status, and the one destructive action.
import { useEffect, useState } from "react";
import type { ConnectionState } from "document-models/connection";
import {
  checkConnection,
  fetchPieceCatalog,
  type ConnectionCheckResult,
  type PieceSummary,
} from "../workflow-editor/runtime-api.js";
import { packageFromConnectorId } from "./piece-auth.js";
import { Button } from "../shared/controls.js";
import { Icon } from "../shared/icons.js";
import { formatWhen } from "../workflow-studio/components/run-format.js";
import { CONNECTION_STATUS_LABEL, CONNECTION_STATUS_STYLES } from "./status.js";

// Runs the piece's own check server-side; the outcome lands on the document.
function useConnectionTest(connectionId: string) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<ConnectionCheckResult | null>(null);
  const test = () => {
    setTesting(true);
    setResult(null);
    checkConnection(connectionId)
      .then(setResult)
      .catch((error: unknown) =>
        setResult({
          ok: false,
          detail: error instanceof Error ? error.message : String(error),
          accountLabel: null,
        }),
      )
      .finally(() => setTesting(false));
  };
  return { testing, result, test };
}

export function ConnectionToolbar(props: {
  connectionId: string;
  // Enabled workflows that stop working if this is revoked.
  enabledDependents: number;
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
  const { testing, result, test } = useConnectionTest(props.connectionId);

  return (
    <header className="mb-8 flex flex-wrap items-start gap-4">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-solid border-foreground/10 bg-white">
        {piece?.logoUrl ? (
          <img src={piece.logoUrl} alt="" className="h-8 w-8 object-contain" />
        ) : (
          <Icon name="link" className="h-6 w-6 text-neutral-500" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <input
          key={state.name}
          className="-mx-1.5 w-full max-w-md rounded-md border border-solid border-transparent bg-transparent px-1.5 text-xl font-semibold tracking-tight text-foreground hover:border-foreground/15 focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/25"
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
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${CONNECTION_STATUS_STYLES[state.status]}`}
          >
            {CONNECTION_STATUS_LABEL[state.status]}
          </span>
          <span>
            {piece?.displayName ?? (packageName || "No service picked")}
            {state.accountLabel ? (
              <>
                {" "}
                as{" "}
                <span className="font-medium text-foreground">
                  {state.accountLabel}
                </span>
              </>
            ) : null}
          </span>
        </p>
        <p
          className="mt-1 text-xs text-muted-foreground"
          title={
            state.lastCheckedAt
              ? new Date(state.lastCheckedAt).toLocaleString()
              : undefined
          }
        >
          {state.lastCheckedAt
            ? `Last checked ${formatWhen(state.lastCheckedAt)}`
            : "Never checked"}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="danger" onClick={props.onDelete}>
          Delete
        </Button>
        <Button
          size="sm"
          title={
            !revoked && props.enabledDependents > 0
              ? `${props.enabledDependents} enabled ${props.enabledDependents === 1 ? "workflow stops" : "workflows stop"} working while it's revoked`
              : undefined
          }
          onClick={() => props.onSetStatus(revoked ? "OK" : "REVOKED")}
        >
          {revoked ? "Reactivate" : "Revoke"}
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={testing || revoked || !packageName}
          onClick={test}
        >
          <Icon name="check" className="h-3.5 w-3.5" />
          {testing ? "Testing…" : "Test connection"}
        </Button>
      </div>
      {result ? (
        <p
          role="status"
          className={`flex w-full items-start gap-2 rounded-md px-3 py-2 text-xs ${
            result.ok ? "bg-wf-ok/10 text-wf-ok" : "bg-wf-fail/10 text-wf-fail"
          }`}
        >
          <Icon
            name={result.ok ? "check" : "alert"}
            className="mt-px h-3.5 w-3.5"
          />
          <span className="min-w-0 break-words">
            {result.ok
              ? `It works${result.accountLabel ? `, signed in as ${result.accountLabel}` : ""}.`
              : result.detail}
          </span>
        </p>
      ) : null}
    </header>
  );
}
