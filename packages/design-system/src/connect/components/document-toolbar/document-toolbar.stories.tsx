import { type Meta, type StoryObj } from "@storybook/react";
import { generateLargeTimeline } from "../document-timeline/mock-utils.js";
import { DocumentToolbar } from "./document-toolbar.js";

const timelineData = generateLargeTimeline(200);

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
    timelineItems: timelineData,
    timelineButtonVisible: true,
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
    timelineItems: [],
    timelineButtonVisible: true,
  },
};

export const WithTimelineExpanded: Story = {
  args: {
    ...Default.args,
    initialTimelineVisible: true,
  },
  render: (args) => (
    <div className="flex flex-col gap-4">
      <div className="text-sm text-gray-500">
        Timeline is automatically shown on initial render
      </div>
      <DocumentToolbar {...args} />
    </div>
  ),
};

export const WithoutTimelineButton: Story = {
  args: {
    ...Default.args,
    timelineButtonVisible: false,
  },
  parameters: {
    docs: {
      description: {
        story: "A toolbar without the timeline button visible",
      },
    },
  },
};

export const WithEmptyTimeline: Story = {
  args: {
    ...Default.args,
    timelineItems: [],
    initialTimelineVisible: false,
  },
  parameters: {
    docs: {
      description: {
        story:
          "A toolbar with an empty timeline (timeline button should be disabled)",
      },
    },
  },
};
