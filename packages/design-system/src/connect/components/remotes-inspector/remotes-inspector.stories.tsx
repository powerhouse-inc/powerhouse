import type { Meta, StoryObj } from "@storybook/react";
import {
  type IChannel,
  type Remote,
  type SyncOperation,
  SyncOperationStatus,
} from "@powerhousedao/reactor";
import { RemotesInspector } from "./remotes-inspector.js";

const meta: Meta<typeof RemotesInspector> = {
  title: "Connect/Components/RemotesInspector/RemotesInspector",
  component: RemotesInspector,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div className="h-[600px] w-full">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof RemotesInspector>;

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

const mockRemotes: Remote[] = [
  {
    id: "abc-123-def-456",
    name: "remote-main",
    collectionId: "drive:main/documents",
    filter: {
      documentId: [],
      scope: [],
      branch: "main",
    },
    options: { sinceTimestampUtcMs: "0" },
    channel: createMockChannel(
      [
        createMockSyncOperation(
          "op-001",
          "doc-abc",
          "main",
          SyncOperationStatus.TransportPending,
          5,
        ),
        createMockSyncOperation(
          "op-002",
          "doc-def",
          "main",
          SyncOperationStatus.ExecutionPending,
          3,
        ),
        createMockSyncOperation(
          "op-003",
          "doc-ghi",
          "dev",
          SyncOperationStatus.Applied,
          2,
        ),
      ],
      [
        createMockSyncOperation(
          "op-101",
          "doc-xyz",
          "main",
          SyncOperationStatus.TransportPending,
          7,
        ),
        createMockSyncOperation(
          "op-102",
          "doc-uvw",
          "feat",
          SyncOperationStatus.TransportPending,
          1,
        ),
      ],
      [
        createMockSyncOperation(
          "op-050",
          "doc-err",
          "main",
          SyncOperationStatus.Error,
          4,
          "SIGNATURE_INVALID",
        ),
      ],
    ),
  },
  {
    id: "ghi-789-jkl-012",
    name: "remote-dev",
    collectionId: "drive:dev/experiments",
    filter: {
      documentId: ["doc-1", "doc-2"],
      scope: ["scope-a"],
      branch: "dev",
    },
    options: { sinceTimestampUtcMs: "0" },
    channel: createMockChannel(
      [
        createMockSyncOperation(
          "op-201",
          "doc-test",
          "dev",
          SyncOperationStatus.Applied,
          10,
        ),
      ],
      [],
      [],
    ),
  },
  {
    id: "mno-345-pqr-678",
    name: "remote-feature",
    collectionId: "drive:feature/new-ui",
    filter: {
      documentId: [],
      scope: ["ui", "components"],
      branch: "feature/new-ui",
    },
    options: { sinceTimestampUtcMs: "0" },
    channel: createMockChannel([], [], []),
  },
];

export const Default: Story = {
  args: {
    getRemotes: () => Promise.resolve(mockRemotes),
  },
};

export const EmptyRemotes: Story = {
  args: {
    getRemotes: () => Promise.resolve([]),
  },
};

export const SingleRemote: Story = {
  args: {
    getRemotes: () => Promise.resolve([mockRemotes[0]]),
  },
};

const manyRemotes: Remote[] = Array.from({ length: 20 }, (_, i) => ({
  id: `remote-id-${i + 1}-${Math.random().toString(36).slice(2, 8)}`,
  name: `remote-${i + 1}`,
  collectionId: `drive:collection-${i + 1}/path`,
  filter: {
    documentId: i % 3 === 0 ? [`doc-${i}`] : [],
    scope: i % 2 === 0 ? ["scope-a"] : [],
    branch: i % 4 === 0 ? "main" : i % 4 === 1 ? "dev" : `feature-${i}`,
  },
  options: { sinceTimestampUtcMs: "0" },
  channel: createMockChannel(
    Array.from({ length: i % 5 }, (_, j) =>
      createMockSyncOperation(
        `op-${i}-${j}`,
        `doc-${i}-${j}`,
        "main",
        SyncOperationStatus.TransportPending,
        j + 1,
      ),
    ),
    Array.from({ length: (i + 1) % 3 }, (_, j) =>
      createMockSyncOperation(
        `op-out-${i}-${j}`,
        `doc-out-${i}-${j}`,
        "main",
        SyncOperationStatus.ExecutionPending,
        j + 2,
      ),
    ),
    i % 7 === 0
      ? [
          createMockSyncOperation(
            `op-dead-${i}`,
            `doc-dead-${i}`,
            "main",
            SyncOperationStatus.Error,
            1,
            "HASH_MISMATCH",
          ),
        ]
      : [],
  ),
}));

export const ManyRemotes: Story = {
  args: {
    getRemotes: () => Promise.resolve(manyRemotes),
  },
};
