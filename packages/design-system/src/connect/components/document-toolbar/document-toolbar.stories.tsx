import { Meta, StoryObj } from "@storybook/react";
import { DocumentToolbar } from "./document-toolbar";

const meta = {
  title: "Connect/Components/DocumentToolbar",
  component: DocumentToolbar,
} satisfies Meta<typeof DocumentToolbar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: "My Document Model V2",
    canUndo: true,
    canRedo: true,
    redo: () => console.log("redo"),
    undo: () => console.log("undo"),
    onClose: () => console.log("close"),
    onExport: () => console.log("export"),
    onShowRevisionHistory: () => console.log("show revision history"),
    onSwitchboardLinkClick: () => console.log("switchboard link click"),
  },
};