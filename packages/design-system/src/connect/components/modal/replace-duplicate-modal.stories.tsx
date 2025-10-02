import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { ConnectReplaceDuplicateModal } from "./replace-duplicate-modal.js";

const meta: Meta<typeof ConnectReplaceDuplicateModal> = {
  title: "Connect/Components/Modal/Replace Duplicate Modal",
  component: ConnectReplaceDuplicateModal,
  parameters: {
    layout: "centered",
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

function ModalWrapper(args: any) {
  const [open, setOpen] = useState(true);

  return (
    <div>
      <button
        onClick={() => setOpen(true)}
        className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
      >
        Open Modal
      </button>
      <ConnectReplaceDuplicateModal
        {...args}
        open={open}
        onOpenChange={setOpen}
        onReplace={() => {
          console.log("Replace clicked");
          setOpen(false);
        }}
        onDuplicate={() => {
          console.log("Duplicate clicked");
          setOpen(false);
        }}
      />
    </div>
  );
}

export const Default: Story = {
  render: (args) => <ModalWrapper {...args} />,
  args: {
    fileName: "document.pdf",
  },
};

export const WithoutFileName: Story = {
  render: (args) => <ModalWrapper {...args} />,
  args: {},
};

export const CustomMessage: Story = {
  render: (args) => <ModalWrapper {...args} />,
  args: {
    fileName: "report.docx",
    message: "This file already exists. What would you like to do?",
  },
};

export const CustomLabels: Story = {
  render: (args) => <ModalWrapper {...args} />,
  args: {
    fileName: "image.png",
    replaceLabel: "Overwrite",
    duplicateLabel: "Keep Both",
  },
};
