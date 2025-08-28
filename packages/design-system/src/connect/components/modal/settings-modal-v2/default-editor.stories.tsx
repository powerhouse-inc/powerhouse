import { useArgs } from "@storybook/preview-api";
import type { Meta, StoryObj } from "@storybook/react";
import { useCallback } from "react";
import { DefaultEditor } from "./default-editor.js";
import { mockDocumentModelEditorOptions } from "./mocks.js";
const meta = {
  title: "Connect/Components/Default Editor",
  component: DefaultEditor,
} satisfies Meta<typeof DefaultEditor>;

export default meta;

type Story = StoryObj<typeof meta>;
export const Default: Story = {
  args: {
    documentModelEditor: mockDocumentModelEditorOptions[0].value,
    documentModelEditorOptions: mockDocumentModelEditorOptions,
    setDocumentModelEditor: () => {},
  },
  render: function Wrapper(args) {
    const [, setArgs] = useArgs<typeof args>();
    const setDocumentModelEditor = useCallback(
      (value: string) => {
        setArgs({ ...args, documentModelEditor: value });
      },
      [args, setArgs],
    );
    return (
      <DefaultEditor
        {...args}
        setDocumentModelEditor={setDocumentModelEditor}
      />
    );
  },
};
