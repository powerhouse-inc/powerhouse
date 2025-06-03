import type { Meta, StoryObj } from "@storybook/react";
import { CharacterCounter } from "./character-counter.js";

const meta = {
  title: "UI/CharacterCounter",
  component: CharacterCounter,
  parameters: {
    layout: "centered",
    chromatic: {
      disableSnapshot: true,
    },
  },
  tags: ["autodocs"],
  argTypes: {
    maxLength: {
      control: "number",
      description: "Maximum number of characters allowed",
    },
    value: {
      control: "text",
      description: "Current text value to count characters from",
    },
  },
} satisfies Meta<typeof CharacterCounter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    maxLength: 10,
    value: "",
  },
};

export const AtLimit: Story = {
  args: {
    maxLength: 10,
    value: "HelloWorld",
  },
};

export const ExceedingLimit: Story = {
  args: {
    maxLength: 10,
    value: "Hello World!",
  },
};

export const LargeLimit: Story = {
  args: {
    maxLength: 100,
    value:
      "This is a longer text that demonstrates the counter with a larger character limit",
  },
};
