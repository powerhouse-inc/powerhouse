import type { Meta, StoryObj } from "@storybook/react";
import { Skip } from "./skip.js";

const meta = {
  title: "Connect/Components/Revision History/Skip",
  component: Skip,
} satisfies Meta<typeof Skip>;

export default meta;

type Story = StoryObj<typeof meta>;

export const SkippedOneRevision: Story = {
  args: {
    operationIndex: 10,
    skipCount: 1,
  },
};

export const SkippedMultipleRevisions: Story = {
  args: {
    operationIndex: 10,
    skipCount: 3,
  },
};
