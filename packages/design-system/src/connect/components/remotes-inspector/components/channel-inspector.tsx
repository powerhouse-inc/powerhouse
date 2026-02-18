import { Icon } from "@powerhousedao/design-system";
import {
  GqlRequestChannel,
  IntervalPollTimer,
  type IChannel,
} from "@powerhousedao/reactor";
import { useCallback, useState } from "react";
import { type SortDirection, type SortOptions } from "../utils.js";
import { MailboxTable, type MailboxType } from "./mailbox-table.js";

export type ChannelInspectorProps = {
  readonly remoteName: string;
  readonly channel: IChannel;
  readonly onBack: () => void;
  readonly onRefresh?: () => void;
};

export function ChannelInspector({
  remoteName,
  channel,
  onBack,
  onRefresh,
}: ChannelInspectorProps) {
  const [sorts, setSorts] = useState<
    Record<MailboxType, SortOptions | undefined>
  >({
    inbox: undefined,
    outbox: undefined,
    deadLetter: undefined,
  });

  const [collapsed, setCollapsed] = useState<Record<MailboxType, boolean>>({
    inbox: false,
    outbox: false,
    deadLetter: false,
  });

  const handleToggleCollapse = (mailbox: MailboxType) => {
    setCollapsed((prev) => ({
      ...prev,
      [mailbox]: !prev[mailbox],
    }));
  };

  const handleSort = (mailbox: MailboxType, columnKey: string) => {
    setSorts((prev) => {
      const currentSort = prev[mailbox];
      const newDirection: SortDirection =
        currentSort?.column === columnKey && currentSort.direction === "asc"
          ? "desc"
          : "asc";

      return {
        ...prev,
        [mailbox]: { column: columnKey, direction: newDirection },
      };
    });
  };

  const getPollerControls = useCallback(() => {
    if (!(channel instanceof GqlRequestChannel)) {
      return null;
    }
    const poller = channel.poller;
    if (!(poller instanceof IntervalPollTimer)) {
      return null;
    }
    return poller;
  }, [channel]);

  const pollerControls = getPollerControls();
  const [pollerState, setPollerState] = useState(() => ({
    isPaused: pollerControls?.isPaused() ?? false,
    isRunning: pollerControls?.isRunning() ?? false,
  }));

  const [intervalMs, setIntervalMs] = useState(
    () => pollerControls?.getIntervalMs() ?? 2000,
  );

  const [mailboxStates, setMailboxStates] = useState(() => ({
    inbox: { isPaused: channel.inbox.isPaused() },
    outbox: { isPaused: channel.outbox.isPaused() },
  }));

  const handlePause = useCallback(() => {
    if (pollerControls) {
      pollerControls.pause();
      setPollerState({
        isPaused: pollerControls.isPaused(),
        isRunning: pollerControls.isRunning(),
      });
    }
  }, [pollerControls]);

  const handleResume = useCallback(() => {
    if (pollerControls) {
      pollerControls.resume();
      setPollerState({
        isPaused: pollerControls.isPaused(),
        isRunning: pollerControls.isRunning(),
      });
    }
  }, [pollerControls]);

  const handlePollNow = useCallback(() => {
    if (pollerControls) {
      pollerControls.triggerNow();
    }
  }, [pollerControls]);

  const handleApplyInterval = useCallback(() => {
    if (pollerControls) {
      pollerControls.setIntervalMs(intervalMs);
    }
  }, [pollerControls, intervalMs]);

  const handleMailboxPause = useCallback(
    (mailbox: "inbox" | "outbox") => {
      const mailboxInstance =
        mailbox === "inbox" ? channel.inbox : channel.outbox;
      mailboxInstance.pause();
      setMailboxStates((prev) => ({
        ...prev,
        [mailbox]: { isPaused: mailboxInstance.isPaused() },
      }));
    },
    [channel],
  );

  const handleMailboxResume = useCallback(
    (mailbox: "inbox" | "outbox") => {
      const mailboxInstance =
        mailbox === "inbox" ? channel.inbox : channel.outbox;
      mailboxInstance.resume();
      setMailboxStates((prev) => ({
        ...prev,
        [mailbox]: { isPaused: mailboxInstance.isPaused() },
      }));
    },
    [channel],
  );

  const handleMailboxFlush = useCallback(
    (mailbox: "inbox" | "outbox") => {
      const mailboxInstance =
        mailbox === "inbox" ? channel.inbox : channel.outbox;
      mailboxInstance.flush();
      onRefresh?.();
    },
    [channel, onRefresh],
  );

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 hover:bg-gray-100"
            onClick={onBack}
            type="button"
          >
            <Icon className="rotate-90" name="ChevronDown" size={14} />
            Back
          </button>
          <h2 className="text-lg font-semibold text-gray-900">
            Channel: {remoteName}
          </h2>
        </div>
        {onRefresh && (
          <button
            className="flex items-center gap-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
            onClick={onRefresh}
            type="button"
          >
            <Icon name="Reload" size={14} />
            Refresh
          </button>
        )}
      </div>

      {pollerControls && (
        <div className="rounded border border-gray-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Poller</h3>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-600">
                Status:{" "}
                <span
                  className={
                    pollerState.isPaused ? "text-yellow-600" : "text-green-600"
                  }
                >
                  {pollerState.isPaused ? "Paused" : "Running"}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <label
                  className="text-sm text-gray-600"
                  htmlFor="poll-interval"
                >
                  Interval:
                </label>
                <input
                  className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
                  id="poll-interval"
                  min={100}
                  onChange={(e) => setIntervalMs(Number(e.target.value))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleApplyInterval();
                    }
                  }}
                  type="number"
                  value={intervalMs}
                />
                <span className="text-sm text-gray-500">ms</span>
                <button
                  className="ml-1 rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 hover:bg-gray-100"
                  onClick={handleApplyInterval}
                  type="button"
                >
                  Apply
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              {pollerState.isPaused ? (
                <button
                  className="flex items-center gap-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
                  onClick={handleResume}
                  type="button"
                >
                  Resume
                </button>
              ) : (
                <button
                  className="flex items-center gap-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
                  onClick={handlePause}
                  type="button"
                >
                  Pause
                </button>
              )}
              <button
                className="flex items-center gap-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!pollerState.isPaused}
                onClick={handlePollNow}
                type="button"
              >
                Poll Now
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded border border-gray-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">
          Mailbox Processing
        </h3>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Inbox:{" "}
              <span
                className={
                  mailboxStates.inbox.isPaused
                    ? "text-yellow-600"
                    : "text-green-600"
                }
              >
                {mailboxStates.inbox.isPaused ? "Paused" : "Active"}
              </span>
            </div>
            <div className="flex gap-2">
              {mailboxStates.inbox.isPaused ? (
                <button
                  className="flex items-center gap-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
                  onClick={() => handleMailboxResume("inbox")}
                  type="button"
                >
                  Resume
                </button>
              ) : (
                <button
                  className="flex items-center gap-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
                  onClick={() => handleMailboxPause("inbox")}
                  type="button"
                >
                  Pause
                </button>
              )}
              <button
                className="flex items-center gap-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!mailboxStates.inbox.isPaused}
                onClick={() => handleMailboxFlush("inbox")}
                type="button"
              >
                Flush
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Outbox:{" "}
              <span
                className={
                  mailboxStates.outbox.isPaused
                    ? "text-yellow-600"
                    : "text-green-600"
                }
              >
                {mailboxStates.outbox.isPaused ? "Paused" : "Active"}
              </span>
            </div>
            <div className="flex gap-2">
              {mailboxStates.outbox.isPaused ? (
                <button
                  className="flex items-center gap-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
                  onClick={() => handleMailboxResume("outbox")}
                  type="button"
                >
                  Resume
                </button>
              ) : (
                <button
                  className="flex items-center gap-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
                  onClick={() => handleMailboxPause("outbox")}
                  type="button"
                >
                  Pause
                </button>
              )}
              <button
                className="flex items-center gap-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!mailboxStates.outbox.isPaused}
                onClick={() => handleMailboxFlush("outbox")}
                type="button"
              >
                Flush
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <MailboxTable
          collapsed={collapsed.inbox}
          mailboxType="inbox"
          onSort={handleSort}
          onToggleCollapse={() => handleToggleCollapse("inbox")}
          operations={channel.inbox.items}
          sort={sorts.inbox}
          title="Inbox"
        />

        <MailboxTable
          collapsed={collapsed.outbox}
          mailboxType="outbox"
          onSort={handleSort}
          onToggleCollapse={() => handleToggleCollapse("outbox")}
          operations={channel.outbox.items}
          sort={sorts.outbox}
          title="Outbox"
        />

        <MailboxTable
          collapsed={collapsed.deadLetter}
          mailboxType="deadLetter"
          onSort={handleSort}
          onToggleCollapse={() => handleToggleCollapse("deadLetter")}
          operations={channel.deadLetter.items}
          sort={sorts.deadLetter}
          title="Dead Letter"
        />
      </div>
    </div>
  );
}
