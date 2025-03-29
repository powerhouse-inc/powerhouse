import type { Meta, StoryObj } from "@storybook/react";
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
      { field: "firstName" },
      { field: "email" },
      { field: "walletAddress" },
      { field: "payment" },
      { field: "status" },
      { field: "address.addressLine1" },
      { field: "address.city" },
      { field: "address.state" },
      { field: "address.zip" },
    ],
    data: mockData,
  },
};
