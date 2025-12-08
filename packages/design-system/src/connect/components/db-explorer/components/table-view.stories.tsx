import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { useState } from "react";
import {
  TableView,
  type ColumnInfo,
  type PaginationState,
  type SortOptions,
  type TableViewProps,
} from "./table-view.js";

const meta: Meta<typeof TableView> = {
  title: "Connect/Components/DBExplorer/TableView",
  component: TableView,
  parameters: {
    layout: "padded",
  },
  decorators: [
    (Story) => (
      <div className="w-full max-w-4xl">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof TableView>;

const mockColumns: ColumnInfo[] = [
  { name: "id", dataType: "int4", isNullable: false },
  { name: "name", dataType: "varchar", isNullable: false },
  { name: "email", dataType: "varchar", isNullable: false },
  { name: "created_at", dataType: "timestamp", isNullable: true },
];

const mockRows = [
  {
    id: 1,
    name: "Alice Johnson",
    email: "alice@example.com",
    created_at: "2024-01-15T10:30:00Z",
  },
  {
    id: 2,
    name: "Bob Smith",
    email: "bob@example.com",
    created_at: "2024-01-16T14:20:00Z",
  },
  {
    id: 3,
    name: "Charlie Brown",
    email: "charlie@test.com",
    created_at: null,
  },
  {
    id: 4,
    name: "Diana Prince",
    email: "diana@example.com",
    created_at: "2024-01-18T09:00:00Z",
  },
  {
    id: 5,
    name: "Eve Wilson",
    email: "eve@test.com",
    created_at: "2024-01-19T16:45:00Z",
  },
];

const defaultPagination: PaginationState = {
  offset: 0,
  limit: 50,
  total: 5,
};

export const Default: Story = {
  args: {
    columns: mockColumns,
    rows: mockRows,
    pagination: defaultPagination,
    onPageChange: fn(),
  },
};

export const WithSorting: Story = {
  args: {
    columns: mockColumns,
    rows: mockRows,
    pagination: defaultPagination,
    onPageChange: fn(),
    onSort: fn(),
    currentSort: { column: "name", direction: "asc" },
  },
};

export const WithPagination: Story = {
  args: {
    columns: mockColumns,
    rows: mockRows,
    pagination: {
      offset: 0,
      limit: 50,
      total: 1234,
    },
    onPageChange: fn(),
  },
};

export const MiddlePage: Story = {
  args: {
    columns: mockColumns,
    rows: mockRows,
    pagination: {
      offset: 250,
      limit: 50,
      total: 1234,
    },
    onPageChange: fn(),
  },
};

export const EmptyTable: Story = {
  args: {
    columns: mockColumns,
    rows: [],
    pagination: {
      offset: 0,
      limit: 50,
      total: 0,
    },
    onPageChange: fn(),
  },
};

export const NullValues: Story = {
  args: {
    columns: mockColumns,
    rows: [
      { id: 1, name: "Alice", email: null, created_at: null },
      { id: 2, name: null, email: "bob@test.com", created_at: null },
      { id: 3, name: "Charlie", email: "charlie@test.com", created_at: null },
    ],
    pagination: defaultPagination,
    onPageChange: fn(),
  },
};

const manyColumns: ColumnInfo[] = [
  { name: "id", dataType: "int4", isNullable: false },
  { name: "first_name", dataType: "varchar", isNullable: false },
  { name: "last_name", dataType: "varchar", isNullable: false },
  { name: "email", dataType: "varchar", isNullable: false },
  { name: "phone", dataType: "varchar", isNullable: true },
  { name: "address", dataType: "text", isNullable: true },
  { name: "city", dataType: "varchar", isNullable: true },
  { name: "country", dataType: "varchar", isNullable: true },
  { name: "created_at", dataType: "timestamp", isNullable: true },
  { name: "updated_at", dataType: "timestamp", isNullable: true },
];

const manyColumnsRows = [
  {
    id: 1,
    first_name: "Alice",
    last_name: "Johnson",
    email: "alice@example.com",
    phone: "+1-555-0101",
    address: "123 Main Street",
    city: "New York",
    country: "USA",
    created_at: "2024-01-15",
    updated_at: "2024-01-20",
  },
  {
    id: 2,
    first_name: "Bob",
    last_name: "Smith",
    email: "bob@example.com",
    phone: null,
    address: null,
    city: "Los Angeles",
    country: "USA",
    created_at: "2024-01-16",
    updated_at: null,
  },
];

export const ManyColumns: Story = {
  args: {
    columns: manyColumns,
    rows: manyColumnsRows,
    pagination: defaultPagination,
    onPageChange: fn(),
    onSort: fn(),
  },
};

function InteractiveWrapper(args: TableViewProps) {
  const [pagination, setPagination] = useState<PaginationState>({
    offset: 0,
    limit: 50,
    total: 1234,
  });
  const [currentSort, setCurrentSort] = useState<SortOptions | undefined>();

  const handlePageChange = (offset: number) => {
    setPagination((prev) => ({ ...prev, offset }));
    args.onPageChange(offset);
  };

  const handleSort = (sort: SortOptions) => {
    setCurrentSort(sort);
    args.onSort?.(sort);
  };

  return (
    <TableView
      {...args}
      currentSort={currentSort}
      pagination={pagination}
      onPageChange={handlePageChange}
      onSort={handleSort}
    />
  );
}

export const Interactive: Story = {
  render: InteractiveWrapper,
  args: {
    columns: mockColumns,
    rows: mockRows,
    pagination: {
      offset: 0,
      limit: 50,
      total: 1234,
    },
    onPageChange: fn(),
    onSort: fn(),
  },
};
