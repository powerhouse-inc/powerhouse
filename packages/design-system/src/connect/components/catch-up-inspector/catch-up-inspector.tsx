import { Icon } from "#design-system";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";

export type WatermarkStatus = {
  head: number;
  settledThrough: number;
  waitingOn: string[];
  stalledSinceUtcMs?: number;
};

export type SweepBlockedAt = {
  ordinal: number;
  documentId: string;
  scope: string;
  branch: string;
  type: string;
  error: string;
};

export type CatchUpConsumerStatus = {
  consumerId: string;
  thread: "host" | "projection";
  appliedThrough: number;
  trackedAbove: number;
  blockedAt?: SweepBlockedAt;
  lastAdvanceUtcMs: number;
};

export type CatchUpStatus = {
  watermark: WatermarkStatus;
  consumers: CatchUpConsumerStatus[];
};

export type CatchUpInspectorProps = {
  readonly status: CatchUpStatus | undefined;
  readonly onRefresh: () => Promise<void>;
  readonly onSweepNow: () => Promise<void>;
};

type ColumnDef = {
  readonly key: string;
  readonly label: string;
  readonly width?: string;
};

const COLUMNS: ColumnDef[] = [
  { key: "consumerId", label: "Consumer", width: "180px" },
  { key: "thread", label: "Thread", width: "90px" },
  { key: "appliedThrough", label: "Applied Through", width: "110px" },
  { key: "lag", label: "Lag", width: "70px" },
  { key: "trackedAbove", label: "Tracked Above", width: "100px" },
  { key: "lastAdvance", label: "Last Advance", width: "160px" },
  { key: "blockedOrdinal", label: "Blocked At", width: "90px" },
  { key: "blockedDocument", label: "Document", width: "150px" },
  { key: "blockedScope", label: "Scope", width: "80px" },
  { key: "blockedBranch", label: "Branch", width: "80px" },
  { key: "blockedType", label: "Type", width: "140px" },
  { key: "blockedError", label: "Error", width: "180px" },
];

const POLL_INTERVAL_MS = 2000;

function truncateId(id: string, maxLength: number = 12): string {
  if (id.length <= maxLength) return id;
  return id.slice(0, maxLength) + "...";
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function Empty() {
  return <span className="text-muted-foreground">-</span>;
}

function Cell({ children }: { readonly children: ReactNode }) {
  return (
    <td className="border-l border-border px-3 py-2 text-xs text-foreground">
      {children}
    </td>
  );
}

function TruncatedText({
  text,
  className,
}: {
  readonly text: string;
  readonly className?: string;
}) {
  return (
    <span className={twMerge("block truncate", className)} title={text}>
      {text}
    </span>
  );
}

export function CatchUpInspector({
  status,
  onRefresh,
  onSweepNow,
}: CatchUpInspectorProps) {
  const [loading, setLoading] = useState(true);
  const [sweeping, setSweeping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number | undefined>();

  const loadStatus = useCallback(async () => {
    try {
      await onRefresh();
      setError(null);
      setNow(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [onRefresh]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks-extra/set-state-in-effect
    void loadStatus();

    const interval = setInterval(() => {
      void loadStatus();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [loadStatus]);

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    await loadStatus();
  }, [loadStatus]);

  const handleSweepNow = useCallback(async () => {
    setSweeping(true);
    try {
      await onSweepNow();
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSweeping(false);
    }
    await loadStatus();
  }, [onSweepNow, loadStatus]);

  const watermark = status?.watermark;
  const consumers = status?.consumers ?? [];
  const settledThrough = watermark?.settledThrough ?? 0;
  const blockedCount = consumers.filter((c) => c.blockedAt).length;

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex shrink-0 items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">
          Catch-up Inspector
        </h2>
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-1 rounded-sm border border-border bg-background px-3 py-1.5 text-sm text-foreground hover:hover-effect disabled:disabled-effect"
            disabled={sweeping}
            onClick={() => void handleSweepNow()}
            type="button"
          >
            Sweep now
          </button>
          <button
            className="flex items-center gap-1 rounded-sm border border-border bg-background px-3 py-1.5 text-sm text-foreground hover:hover-effect disabled:disabled-effect"
            disabled={loading}
            onClick={() => void handleRefresh()}
            type="button"
          >
            <Icon name="Reload" size={14} />
            Refresh
          </button>
        </div>
      </div>

      {watermark && (
        <div className="flex shrink-0 flex-wrap items-center gap-4 rounded-lg bg-muted px-4 py-2 text-sm">
          <div className="text-foreground">
            Head: <span className="font-medium">{watermark.head}</span>
          </div>
          <div className="text-foreground">
            Settled through:{" "}
            <span className="font-medium">{watermark.settledThrough}</span>
          </div>
          <div className="text-foreground">
            Lag:{" "}
            <span className="font-medium">
              {watermark.head - watermark.settledThrough}
            </span>
          </div>
          <div className="text-foreground">
            Waiting on:{" "}
            <span className="font-medium">
              {watermark.waitingOn.length > 0
                ? watermark.waitingOn.join(", ")
                : "none"}
            </span>
          </div>
          {watermark.stalledSinceUtcMs !== undefined && now !== undefined && (
            <div className="flex items-center gap-2 text-destructive">
              <span className="size-2 rounded-full bg-destructive" />
              Stalled for:{" "}
              <span
                className="font-medium"
                title={new Date(watermark.stalledSinceUtcMs).toISOString()}
              >
                {formatDuration(now - watermark.stalledSinceUtcMs)}
              </span>
            </div>
          )}
          <div className="flex items-center gap-2 text-foreground">
            <span className="size-2 rounded-full bg-destructive" />
            Blocked: <span className="font-medium">{blockedCount}</span>
          </div>
        </div>
      )}

      {error && (
        <div className="shrink-0 rounded-lg border border-destructive bg-destructive/10 px-4 py-2 text-sm text-destructive">
          Catch-up request failed: {error}
        </div>
      )}

      <div className="max-h-full overflow-auto rounded-lg border border-border">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-muted">
            <tr>
              {COLUMNS.map((column, index) => (
                <th
                  key={column.key}
                  className={twMerge(
                    "px-3 py-2 text-left text-xs font-medium text-foreground",
                    index > 0 && "border-l border-border",
                  )}
                  style={{ width: column.width }}
                >
                  <span className="truncate">{column.label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && !status ? (
              <tr>
                <td
                  className="px-3 py-8 text-center text-sm text-muted-foreground"
                  colSpan={COLUMNS.length}
                >
                  Loading...
                </td>
              </tr>
            ) : consumers.length === 0 ? (
              <tr>
                <td
                  className="px-3 py-8 text-center text-sm text-muted-foreground"
                  colSpan={COLUMNS.length}
                >
                  No catch-up consumers
                </td>
              </tr>
            ) : (
              consumers.map((consumer) => {
                const blocked = consumer.blockedAt;
                const lastAdvance = new Date(consumer.lastAdvanceUtcMs);
                return (
                  <tr
                    key={consumer.consumerId}
                    className={twMerge(
                      "hover:hover-effect",
                      blocked
                        ? "bg-destructive/10"
                        : "odd:bg-card even:bg-background",
                    )}
                  >
                    <td className="px-3 py-2 text-xs text-foreground">
                      <TruncatedText text={consumer.consumerId} />
                    </td>
                    <Cell>{consumer.thread}</Cell>
                    <Cell>{consumer.appliedThrough}</Cell>
                    <Cell>{settledThrough - consumer.appliedThrough}</Cell>
                    <Cell>{consumer.trackedAbove}</Cell>
                    <Cell>
                      <span
                        className="block truncate"
                        title={lastAdvance.toISOString()}
                      >
                        {lastAdvance.toLocaleString()}
                      </span>
                    </Cell>
                    <Cell>{blocked ? blocked.ordinal : <Empty />}</Cell>
                    <Cell>
                      {blocked ? (
                        <span
                          className="block truncate"
                          title={blocked.documentId}
                        >
                          {truncateId(blocked.documentId)}
                        </span>
                      ) : (
                        <Empty />
                      )}
                    </Cell>
                    <Cell>{blocked ? blocked.scope : <Empty />}</Cell>
                    <Cell>{blocked ? blocked.branch : <Empty />}</Cell>
                    <Cell>
                      {blocked ? (
                        <TruncatedText text={blocked.type} />
                      ) : (
                        <Empty />
                      )}
                    </Cell>
                    <Cell>
                      {blocked ? (
                        <TruncatedText
                          className="text-destructive"
                          text={blocked.error}
                        />
                      ) : (
                        <Empty />
                      )}
                    </Cell>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="shrink-0 text-sm text-foreground">
        Showing {consumers.length} consumer(s)
      </div>
    </div>
  );
}
