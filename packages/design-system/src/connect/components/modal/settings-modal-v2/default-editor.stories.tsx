import { useArgs } from "@storybook/preview-api";
import { Meta, StoryObj } from "@storybook/react";
import { useCallback } from "react";
import { DefaultEditor } from "./default-editor.js";
const meta = {
  title: "Connect/Components/Default Editor",
  component: DefaultEditor,
} satisfies Meta<typeof DefaultEditor>;

export default meta;

type Story = StoryObj<typeof meta>;

const options = [
  { label: "V1", value: "document-model-editor" },
  { label: "V2", value: "document-model-editor-v2" },
];

export const DefaultEditorStory: Story = {
  args: {
    documentModelEditor: options[0].value,
    options,
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
