import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { useState } from "react";
import {
  SchemaTreeSidebar,
  type SchemaTreeSidebarProps,
  type TableInfo,
} from "./schema-tree-sidebar.js";

const meta: Meta<typeof SchemaTreeSidebar> = {
  title: "Connect/Components/DBExplorer/SchemaTreeSidebar",
  component: SchemaTreeSidebar,
  parameters: {
    layout: "padded",
  },
  decorators: [
    (Story) => (
      <div className="w-64 border border-gray-200 bg-white">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof SchemaTreeSidebar>;

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

export const Default: Story = {
  args: {
    schema: "public",
    tables: mockTables,
    onSelectTable: fn(),
  },
};

export const WithSelectedTable: Story = {
  args: {
    schema: "public",
    tables: mockTables,
    selectedTable: "users",
    onSelectTable: fn(),
  },
};

export const EmptySchema: Story = {
  args: {
    schema: "public",
    tables: [],
    onSelectTable: fn(),
  },
};

const manyTables: TableInfo[] = mockTables.concat([
  { name: "categories", columns: [] },
  { name: "products", columns: [] },
  { name: "orders", columns: [] },
  { name: "order_items", columns: [] },
  { name: "payments", columns: [] },
  { name: "reviews", columns: [] },
  { name: "sessions", columns: [] },
  { name: "logs", columns: [] },
]);

export const ManyTables: Story = {
  args: {
    schema: "public",
    tables: manyTables,
    onSelectTable: fn(),
  },
};

function InteractiveWrapper(args: SchemaTreeSidebarProps) {
  const [selectedTable, setSelectedTable] = useState<string | undefined>();

  const handleSelectTable = (table: string) => {
    setSelectedTable(table);
    args.onSelectTable(table);
  };

  return (
    <SchemaTreeSidebar
      {...args}
      selectedTable={selectedTable}
      onSelectTable={handleSelectTable}
    />
  );
}

export const Interactive: Story = {
  render: InteractiveWrapper,
  args: {
    schema: "public",
    tables: mockTables,
    onSelectTable: fn(),
  },
};
