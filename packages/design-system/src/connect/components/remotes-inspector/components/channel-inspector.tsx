import { Icon } from "@powerhousedao/design-system";
import type { IChannel } from "@powerhousedao/reactor";
import { useState } from "react";
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

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex shrink-0 items-center justify-between">
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

      <div className="flex flex-1 flex-col gap-6 overflow-auto">
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
