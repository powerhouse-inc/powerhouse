import { initTheme } from "@powerhousedao/reactor-browser";
import type { Meta, StoryObj } from "@storybook/react";
import { ThemeSwitch } from "./theme-switch.js";

const meta: Meta<typeof ThemeSwitch> = {
  title: "Connect/Components/Theme Switch",
  component: ThemeSwitch,
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: function Render() {
    initTheme();
    return <ThemeSwitch />;
  },
};
