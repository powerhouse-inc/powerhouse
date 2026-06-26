import { Icon } from "#design-system";
import { useCallback, useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";

export type WorkerInfo = {
  readonly namespace: string;
  readonly ownerId: string;
  readonly bootedAtMs: number;
  readonly connectedClients: number;
  readonly appBuildId: string;
  readonly rpcProtocolVersion: number;
};

export type WorkerInspectorProps = {
  readonly getInfo: () => Promise<WorkerInfo>;
  readonly onRestart: () => Promise<void>;
};

function formatUptime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (hours > 0 || minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(" ");
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="font-mono text-sm break-all text-foreground">
        {value}
      </span>
    </div>
  );
}

export function WorkerInspector({ getInfo, onRestart }: WorkerInspectorProps) {
  const [info, setInfo] = useState<WorkerInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [restarting, setRestarting] = useState(false);

  const loadInfo = useCallback(async () => {
    try {
      const next = await getInfo();
      setInfo(next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [getInfo]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadInfo();
    const interval = setInterval(() => {
      void loadInfo();
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [loadInfo]);

  const handleRestart = useCallback(async () => {
    if (
      !window.confirm(
        "Restart the reactor worker? All tabs sharing it will reload.",
      )
    ) {
      return;
    }
    setRestarting(true);
    try {
      await onRestart();
    } finally {
      setRestarting(false);
    }
  }, [onRestart]);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex shrink-0 items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">
          Worker Inspector
        </h2>
        <button
          className={twMerge(
            "flex items-center gap-1 rounded-sm border px-3 py-1.5 text-sm",
            "border-warning bg-warning/10 text-warning hover:hover-effect disabled:disabled-effect",
          )}
          disabled={restarting || !info}
          onClick={() => void handleRestart()}
          type="button"
        >
          <Icon name="Reload" size={14} />
          {restarting ? "Restarting..." : "Restart Worker"}
        </button>
      </div>

      {error ? (
        <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : !info ? (
        <div className="rounded-lg bg-muted px-4 py-8 text-center text-sm text-muted-foreground">
          Loading worker info...
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 rounded-lg border border-border p-4">
          <Field label="Worker name" value={info.namespace} />
          <Field label="Owner ID (boot)" value={info.ownerId} />
          <Field label="Uptime" value={formatUptime(now - info.bootedAtMs)} />
          <Field label="Connected tabs" value={String(info.connectedClients)} />
          <Field label="App build" value={info.appBuildId} />
          <Field label="RPC protocol" value={String(info.rpcProtocolVersion)} />
        </div>
      )}
    </div>
  );
}
