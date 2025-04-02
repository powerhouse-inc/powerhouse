import type { Meta, StoryObj } from "@storybook/react";
import { cn } from "../../../scalars/index.js";
import { mockData, type MockedPerson } from "./mock-data.js";
import { ObjectSetTable } from "./object-set-table.js";

const meta: Meta<typeof ObjectSetTable> = {
  title: "Document Engineering/Data Display/Object Set Table",
  component: ObjectSetTable,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
  argTypes: {
    columns: {
      control: "object",
      description: "The columns to display in the table.",
      table: {
        type: {
          summary: "ColumnDef[]",
        },
        readonly: true,
      },
    },
    data: {
      control: "object",
      description: "The data to display in the table.",
      table: {
        type: {
          summary: "DataType[]",
        },
        readonly: true,
      },
    },
    allowRowSelection: {
      control: "boolean",
      description: "Whether to allow row selection.",
      table: {
        type: {
          summary: "boolean",
        },
      },
    },
    showRowNumbers: {
      control: "boolean",
      description: "Whether to show row numbers.",
      table: {
        type: {
          summary: "boolean",
        },
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof ObjectSetTable<MockedPerson>>;

export const Default: Story = {
  args: {
    columns: [
      { field: "firstName", editable: true },
      { field: "email", editable: true },
      {
        field: "walletAddress",
        editable: true,
        renderCell: (value) => (
          <div>
            {value} <button tabIndex={0}>😶‍🌫️</button>
          </div>
        ),
      },
      { field: "payment", type: "number", editable: true },
      {
        field: "status",
        renderCell: (value: "active" | "inactive") => (
          <span
            className={cn(
              "rounded-sm p-0.5 text-gray-50",
              value === "active" ? "bg-green-900" : "bg-red-900",
            )}
          >
            {value}
          </span>
        ),
      },
      { field: "address.addressLine1", editable: true },
      { field: "address.city", editable: true },
      { field: "address.state", editable: true },
      { field: "address.zip", editable: true },
    ],
    data: mockData,
  },
};
