import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import {
  type IChannel,
  type SyncOperation,
  SyncOperationStatus,
} from "@powerhousedao/reactor";
import { ChannelInspector } from "./channel-inspector.js";

const meta: Meta<typeof ChannelInspector> = {
  title: "Connect/Components/RemotesInspector/ChannelInspector",
  component: ChannelInspector,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div className="h-[700px] w-full">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ChannelInspector>;

function createMockMailbox<T>(items: T[]): { items: readonly T[] } {
  return {
    get items() {
      return items as readonly T[];
    },
  };
}

function createMockSyncOperation(
  id: string,
  documentId: string,
  branch: string,
  status: SyncOperationStatus,
  opsCount: number,
  errorMessage?: string,
): SyncOperation {
  return {
    id,
    remoteName: "mock-remote",
    documentId,
    scopes: ["global"],
    branch,
    operations: Array(opsCount).fill({ type: "mock" }),
    status,
    error: errorMessage
      ? { source: "channel", error: new Error(errorMessage) }
      : undefined,
  } as unknown as SyncOperation;
}

function createMockChannel(
  inboxOps: SyncOperation[],
  outboxOps: SyncOperation[],
  deadLetterOps: SyncOperation[],
): IChannel {
  return {
    inbox: createMockMailbox(inboxOps),
    outbox: createMockMailbox(outboxOps),
    deadLetter: createMockMailbox(deadLetterOps),
  } as unknown as IChannel;
}

const fullChannel = createMockChannel(
  [
    createMockSyncOperation(
      "inbox-op-001",
      "doc-abc-123",
      "main",
      SyncOperationStatus.TransportPending,
      5,
    ),
    createMockSyncOperation(
      "inbox-op-002",
      "doc-def-456",
      "main",
      SyncOperationStatus.ExecutionPending,
      3,
    ),
    createMockSyncOperation(
      "inbox-op-003",
      "doc-ghi-789",
      "dev",
      SyncOperationStatus.Applied,
      2,
    ),
  ],
  [
    createMockSyncOperation(
      "outbox-op-101",
      "doc-xyz-111",
      "main",
      SyncOperationStatus.TransportPending,
      7,
    ),
    createMockSyncOperation(
      "outbox-op-102",
      "doc-uvw-222",
      "feat",
      SyncOperationStatus.TransportPending,
      1,
    ),
  ],
  [
    createMockSyncOperation(
      "dead-op-050",
      "doc-err-333",
      "main",
      SyncOperationStatus.Error,
      4,
      "SIGNATURE_INVALID",
    ),
  ],
);

export const Default: Story = {
  args: {
    remoteName: "remote-main",
    channel: fullChannel,
    onBack: fn(),
    onRefresh: fn(),
  },
};

export const EmptyChannel: Story = {
  args: {
    remoteName: "remote-empty",
    channel: createMockChannel([], [], []),
    onBack: fn(),
    onRefresh: fn(),
  },
};

export const OnlyInbox: Story = {
  args: {
    remoteName: "remote-inbox",
    channel: createMockChannel(
      [
        createMockSyncOperation(
          "op-1",
          "doc-1",
          "main",
          SyncOperationStatus.TransportPending,
          5,
        ),
        createMockSyncOperation(
          "op-2",
          "doc-2",
          "main",
          SyncOperationStatus.Applied,
          3,
        ),
      ],
      [],
      [],
    ),
    onBack: fn(),
    onRefresh: fn(),
  },
};

export const OnlyDeadLetter: Story = {
  args: {
    remoteName: "remote-errors",
    channel: createMockChannel(
      [],
      [],
      [
        createMockSyncOperation(
          "dead-1",
          "doc-fail-1",
          "main",
          SyncOperationStatus.Error,
          2,
          "SIGNATURE_INVALID",
        ),
        createMockSyncOperation(
          "dead-2",
          "doc-fail-2",
          "dev",
          SyncOperationStatus.Error,
          1,
          "HASH_MISMATCH",
        ),
        createMockSyncOperation(
          "dead-3",
          "doc-fail-3",
          "main",
          SyncOperationStatus.Error,
          5,
          "MISSING_OPERATIONS",
        ),
      ],
    ),
    onBack: fn(),
    onRefresh: fn(),
  },
};

const manyOperations = createMockChannel(
  Array.from({ length: 15 }, (_, i) =>
    createMockSyncOperation(
      `inbox-${i + 1}`,
      `doc-inbox-${i + 1}`,
      i % 3 === 0 ? "main" : i % 3 === 1 ? "dev" : "feature",
      i % 4 === 0
        ? SyncOperationStatus.TransportPending
        : i % 4 === 1
          ? SyncOperationStatus.ExecutionPending
          : SyncOperationStatus.Applied,
      (i % 10) + 1,
    ),
  ),
  Array.from({ length: 10 }, (_, i) =>
    createMockSyncOperation(
      `outbox-${i + 1}`,
      `doc-outbox-${i + 1}`,
      "main",
      SyncOperationStatus.TransportPending,
      (i % 5) + 1,
    ),
  ),
  Array.from({ length: 5 }, (_, i) =>
    createMockSyncOperation(
      `dead-${i + 1}`,
      `doc-dead-${i + 1}`,
      "main",
      SyncOperationStatus.Error,
      i + 1,
      i % 2 === 0 ? "SIGNATURE_INVALID" : "HASH_MISMATCH",
    ),
  ),
);

export const ManyOperations: Story = {
  args: {
    remoteName: "remote-busy",
    channel: manyOperations,
    onBack: fn(),
    onRefresh: fn(),
  },
};

export const WithoutRefresh: Story = {
  args: {
    remoteName: "remote-main",
    channel: fullChannel,
    onBack: fn(),
  },
};
