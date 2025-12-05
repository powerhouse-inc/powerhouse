import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import {
  type IChannel,
  type Remote,
  type SyncOperation,
  SyncOperationStatus,
} from "@powerhousedao/reactor";
import type {
  GetTableRowsOptions,
  TableInfo,
  TablePage,
} from "../../db-explorer/index.js";
import { InspectorModal } from "./inspector-modal.js";

const meta: Meta<typeof InspectorModal> = {
  title: "Connect/Components/Modal/InspectorModal",
  component: InspectorModal,
  parameters: {
    layout: "centered",
  },
};

export default meta;
type Story = StoryObj<typeof InspectorModal>;

// DB Explorer mock data
const mockTables: TableInfo[] = [
  {
    name: "users",
    columns: [
      { name: "id", dataType: "int4", isNullable: false },
      { name: "name", dataType: "varchar", isNullable: false },
      { name: "email", dataType: "varchar", isNullable: false },
      { name: "created_at", dataType: "timestamp", isNullable: true },
    ],
  },
  {
    name: "posts",
    columns: [
      { name: "id", dataType: "int4", isNullable: false },
      { name: "title", dataType: "varchar", isNullable: false },
      { name: "content", dataType: "text", isNullable: true },
      { name: "author_id", dataType: "int4", isNullable: false },
    ],
  },
  {
    name: "comments",
    columns: [
      { name: "id", dataType: "int4", isNullable: false },
      { name: "post_id", dataType: "int4", isNullable: false },
      { name: "body", dataType: "text", isNullable: false },
    ],
  },
];

function generateMockRows(
  table: string,
  limit: number,
  offset: number,
): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];

  for (let i = 0; i < limit; i++) {
    const rowNum = offset + i + 1;

    if (table === "users") {
      rows.push({
        id: rowNum,
        name: `User ${rowNum}`,
        email: `user${rowNum}@example.com`,
        created_at: `2024-01-${String((rowNum % 28) + 1).padStart(2, "0")}`,
      });
    } else if (table === "posts") {
      rows.push({
        id: rowNum,
        title: `Post Title ${rowNum}`,
        content: `This is the content of post ${rowNum}...`,
        author_id: (rowNum % 10) + 1,
      });
    } else if (table === "comments") {
      rows.push({
        id: rowNum,
        post_id: (rowNum % 20) + 1,
        body: `Comment ${rowNum}: This is a sample comment.`,
      });
    }
  }

  return rows;
}

const tableTotals: Record<string, number> = {
  users: 234,
  posts: 567,
  comments: 1234,
};

const mockGetTableRows = async (
  table: string,
  options: GetTableRowsOptions,
): Promise<TablePage> => {
  await new Promise((resolve) => setTimeout(resolve, 300));

  const total = tableTotals[table] ?? 100;
  const actualLimit = Math.min(options.limit, total - options.offset);

  return {
    columns:
      mockTables.find((t) => t.name === table)?.columns.map((c) => c.name) ??
      [],
    rows: generateMockRows(table, Math.max(0, actualLimit), options.offset),
    total,
  };
};

// Remotes Inspector mock data
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
    options: {},
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
          SyncOperationStatus.Applied,
          3,
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
    options: {},
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
    options: {},
    channel: createMockChannel([], [], []),
  },
];

// Stories
export const Default: Story = {
  args: {
    open: true,
    onOpenChange: fn(),
    defaultTab: "Database",
    dbExplorerProps: {
      schema: "public",
      getTables: () => Promise.resolve(mockTables),
      getTableRows: mockGetTableRows,
    },
    remotesInspectorProps: {
      remotes: mockRemotes,
      onRefresh: fn(),
    },
  },
};

export const DatabaseTab: Story = {
  args: {
    open: true,
    onOpenChange: fn(),
    defaultTab: "Database",
    dbExplorerProps: {
      schema: "public",
      getTables: () => Promise.resolve(mockTables),
      getTableRows: mockGetTableRows,
      onImportDb: (sql: string) => console.log("Import:", sql.slice(0, 50)),
      onExportDb: () => console.log("Export clicked"),
    },
    remotesInspectorProps: {
      remotes: mockRemotes,
      onRefresh: fn(),
    },
  },
};

export const RemotesTab: Story = {
  args: {
    open: true,
    onOpenChange: fn(),
    defaultTab: "Remotes",
    dbExplorerProps: {
      schema: "public",
      getTables: () => Promise.resolve(mockTables),
      getTableRows: mockGetTableRows,
    },
    remotesInspectorProps: {
      remotes: mockRemotes,
      onRefresh: fn(),
    },
  },
};

export const EmptyData: Story = {
  args: {
    open: true,
    onOpenChange: fn(),
    defaultTab: "Database",
    dbExplorerProps: {
      schema: "public",
      getTables: () => Promise.resolve([]),
      getTableRows: mockGetTableRows,
    },
    remotesInspectorProps: {
      remotes: [],
      onRefresh: fn(),
    },
  },
};
