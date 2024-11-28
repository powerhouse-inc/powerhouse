import type { Meta, StoryObj } from "@storybook/react";
import SubmitChangesOnly, { DOCS_CODE } from "./submit-changes-only";

const meta = {
  title: "Document Engineering/Docs/Examples/Submit Changes Only",
  component: SubmitChangesOnly,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      source: {
        language: "tsx",
        format: true,
        code: DOCS_CODE,
      },
    },
  },
} satisfies Meta<typeof SubmitChangesOnly>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
