import { ConnectTooltipProvider } from "@powerhousedao/design-system";
import type { Meta, StoryObj } from "@storybook/react";
import { Errors } from "./errors.js";

const meta = {
  title: "Connect/Components/Revision History/Revision/Errors",
  component: Errors,
} satisfies Meta<typeof Errors>;

export default meta;

type Story = StoryObj<typeof meta>;

export const NoErrors: Story = {
  args: {
    errors: [],
  },
};

export const WithOneError: Story = {
  args: {
    errors: [
      "Data mismatch detected in this signature which needs to be resolved.",
    ],
  },
  render: (props) => (
    <ConnectTooltipProvider>
      <Errors {...props} />,
    </ConnectTooltipProvider>
  ),
};

export const WithMultipleErrors: Story = {
  args: {
    errors: [
      "Data mismatch detected in this signature which needs to be resolved.",
      "Data mismatch detected in this signature which needs to be resolved.",
      "Data mismatch detected in this signature which needs to be resolved.",
    ],
  },
  render: (props) => (
    <ConnectTooltipProvider>
      <Errors {...props} />,
    </ConnectTooltipProvider>
  ),
};
