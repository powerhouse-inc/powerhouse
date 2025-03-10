import { type Meta, type StoryObj } from "@storybook/react";
import { DefaultEditorLoader } from "./default-editor-loader";

const meta: Meta = {
  title: "Connect/Components/Default Editor Loader",
  component: DefaultEditorLoader,
  decorators: [
    (Story) => (
      <div className="mx-auto h-screen w-4/5">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
