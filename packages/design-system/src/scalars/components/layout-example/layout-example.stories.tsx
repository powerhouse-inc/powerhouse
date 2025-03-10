import type React from "react";
import type { Meta, StoryObj } from "@storybook/react";

const LayoutExample: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <div
    style={{ padding: "20px", border: "1px solid #ccc", borderRadius: "4px" }}
  >
    {children}
  </div>
);

const meta: Meta<typeof LayoutExample> = {
  title: "Document Engineering/Layout Components/Example",
  component: LayoutExample,
};

export default meta;
type Story = StoryObj<typeof meta>;

export const HelloWorld: Story = {
  render: () => <LayoutExample>Hello, World!</LayoutExample>,
};
