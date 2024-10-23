import React from "react";
import type { Meta, StoryObj } from "@storybook/react";

const HelloWorld: React.FC = () => {
  return <div>Placeholder Layout component - Hello, World!</div>;
};

const meta: Meta<typeof HelloWorld> = {
  title: "Document Engineering/Layout Components/Example",
  component: HelloWorld,
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};
