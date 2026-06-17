import type { Meta, StoryObj } from "@storybook/react";
import { DriveAuthGate } from "./drive-auth-gate.js";

const meta = {
  title: "Connect/Components/Drive Auth Gate",
  component: DriveAuthGate,
  args: {
    // No-op so the story doesn't trigger the real Renown redirect.
    onLogin: () => alert("Log in clicked"),
  },
  render: (args) => (
    <div className="flex h-screen w-full items-center justify-center bg-muted">
      <DriveAuthGate {...args} />
    </div>
  ),
} satisfies Meta<typeof DriveAuthGate>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
