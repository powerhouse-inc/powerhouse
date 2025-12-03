import type { Meta, StoryObj } from "@storybook/react";
import {
  DBExplorer,
  type GetTableRowsOptions,
  type TableInfo,
  type TablePage,
} from "./db-explorer.js";

const meta: Meta<typeof DBExplorer> = {
  title: "Connect/Components/DBExplorer/DBExplorer",
  component: DBExplorer,
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
type Story = StoryObj<typeof DBExplorer>;

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
      { name: "published_at", dataType: "timestamp", isNullable: true },
    ],
  },
  {
    name: "comments",
    columns: [
      { name: "id", dataType: "int4", isNullable: false },
      { name: "post_id", dataType: "int4", isNullable: false },
      { name: "user_id", dataType: "int4", isNullable: false },
      { name: "body", dataType: "text", isNullable: false },
      { name: "created_at", dataType: "timestamp", isNullable: true },
    ],
  },
  {
    name: "tags",
    columns: [
      { name: "id", dataType: "int4", isNullable: false },
      { name: "name", dataType: "varchar", isNullable: false },
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
        created_at:
          rowNum % 5 === 0
            ? null
            : `2024-01-${String((rowNum % 28) + 1).padStart(2, "0")}`,
      });
    } else if (table === "posts") {
      rows.push({
        id: rowNum,
        title: `Post Title ${rowNum}`,
        content:
          rowNum % 3 === 0 ? null : `This is the content of post ${rowNum}...`,
        author_id: (rowNum % 10) + 1,
        published_at:
          rowNum % 4 === 0
            ? null
            : `2024-02-${String((rowNum % 28) + 1).padStart(2, "0")}`,
      });
    } else if (table === "comments") {
      rows.push({
        id: rowNum,
        post_id: (rowNum % 20) + 1,
        user_id: (rowNum % 10) + 1,
        body: `Comment ${rowNum}: This is a sample comment.`,
        created_at: `2024-03-${String((rowNum % 28) + 1).padStart(2, "0")}`,
      });
    } else if (table === "tags") {
      rows.push({
        id: rowNum,
        name: `tag-${rowNum}`,
      });
    }
  }

  return rows;
}

const tableTotals: Record<string, number> = {
  users: 234,
  posts: 567,
  comments: 1234,
  tags: 45,
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

export const Default: Story = {
  args: {
    schema: "public",
    tables: mockTables,
    getTableRows: mockGetTableRows,
  },
};

export const EmptySchema: Story = {
  args: {
    schema: "public",
    tables: [],
    getTableRows: mockGetTableRows,
  },
};

const singleTable: TableInfo[] = [
  {
    name: "settings",
    columns: [
      { name: "key", dataType: "varchar", isNullable: false },
      { name: "value", dataType: "text", isNullable: true },
    ],
  },
];

const mockGetSettingsRows = async (
  _table: string,
  options: GetTableRowsOptions,
): Promise<TablePage> => {
  await new Promise((resolve) => setTimeout(resolve, 200));

  const allRows = [
    { key: "app_name", value: "My Application" },
    { key: "theme", value: "dark" },
    { key: "max_upload_size", value: "10MB" },
    { key: "debug_mode", value: null },
    { key: "api_endpoint", value: "https://api.example.com" },
  ];

  const start = options.offset;
  const end = Math.min(start + options.limit, allRows.length);

  return {
    columns: ["key", "value"],
    rows: allRows.slice(start, end),
    total: allRows.length,
  };
};

export const SingleTable: Story = {
  args: {
    schema: "config",
    tables: singleTable,
    getTableRows: mockGetSettingsRows,
  },
};

export const CustomPageSize: Story = {
  args: {
    schema: "public",
    tables: mockTables,
    getTableRows: mockGetTableRows,
    pageSize: 10,
  },
};

export const WithImportExport: Story = {
  args: {
    schema: "public",
    tables: mockTables,
    getTableRows: mockGetTableRows,
    onImportDb: (sqlContent: string) => {
      console.log("Import DB called with content:", sqlContent.slice(0, 100));
      alert(`Imported ${sqlContent.length} characters`);
    },
    onExportDb: () => {
      console.log("Export DB called");
      alert("Export DB clicked");
    },
  },
};
