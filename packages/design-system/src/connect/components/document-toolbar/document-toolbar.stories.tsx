import { type Meta, type StoryObj } from "@storybook/react";
import { DocumentToolbar } from "./document-toolbar.js";

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
    onShowTimeline: () => console.log("show timeline"),
  },
};

export const WithDisabledButtons: Story = {
  args: {
    title: "Document with Disabled Actions",
    // Undo/Redo disabled
    canUndo: false,
    canRedo: false,
    redo: () => console.log("redo"),
    undo: () => console.log("undo"),
    // Close button is always enabled
    onClose: () => console.log("close"),
    // All other buttons disabled by not providing handlers
    onExport: undefined,
    onShowRevisionHistory: undefined,
    onSwitchboardLinkClick: undefined,
    onShowTimeline: undefined,
  },
};
