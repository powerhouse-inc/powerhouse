import type { Meta, StoryObj } from "@storybook/react";
import { Header } from "./header.js";

const meta = {
  title: "Connect/Components/Revision History/Header/Header",
  component: Header,
} satisfies Meta<typeof Header>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: "MakerDAO/Monetalis RWA Report 050724",
    scope: "global",
    docId: "ulIcp/LL8qjML1kOWchprJ4oAJM=",
    onChangeScope: () => {},
    onClose: () => {},
  },
};
