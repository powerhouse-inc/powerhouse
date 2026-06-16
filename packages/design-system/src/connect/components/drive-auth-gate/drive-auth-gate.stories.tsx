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
    <div className="flex h-screen w-full flex-col">
      <DriveAuthGate {...args} />
    </div>
  ),
} satisfies Meta<typeof DriveAuthGate>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

// Toggle the Storybook theme toolbar to dark to preview the dark page styles;
// darkMode switches the Renown CTA's inline button styles.
export const DarkMode: Story = {
  args: { darkMode: true },
};
