import type { Meta, StoryObj } from "@storybook/react";
import { mockData, type MockedPerson } from "./mock-data.js";
import { ObjectSetTable } from "./object-set-table.js";

const meta: Meta<typeof ObjectSetTable> = {
  title: "Document Engineering/Data Display/Object Set Table",
  component: ObjectSetTable,
  parameters: {
    layout: "centered",
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
