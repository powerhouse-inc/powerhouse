import { Icon } from "@powerhousedao/design-system";
import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import type { ComponentPropsWithoutRef } from "react";
import { useState } from "react";
import { twMerge } from "tailwind-merge";
import type { TimelineItem } from "../document-timeline/document-timeline.js";
import { DocumentTimeline } from "../document-timeline/document-timeline.js";
import type { DocumentToolbarControl } from "./document-toolbar.js";

/**
 * Presentational version of DocumentToolbar for Storybook
 * This component doesn't use reactor-browser hooks, making it safe for stories
 */
type DocumentToolbarStoryProps = ComponentPropsWithoutRef<"div"> & {
  documentName?: string;
  className?: string;
  enabledControls?: DocumentToolbarControl[];
  disableRevisionHistory?: boolean;
  showSwitchboardLink?: boolean;
  initialTimelineVisible?: boolean;
  defaultTimelineVisible?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onExport?: () => void;
  onClose?: () => void;
  onSwitchboardLinkClick?: () => void;
  onHistoryClick?: () => void;
  timelineItems?: TimelineItem[];
};

const DocumentToolbarStory: React.FC<DocumentToolbarStoryProps> = ({
  documentName = "Untitled Document",
  className,
  enabledControls = ["undo", "redo", "export", "history"],
  disableRevisionHistory = false,
  showSwitchboardLink = false,
  initialTimelineVisible = false,
  defaultTimelineVisible = true,
  canUndo = true,
  canRedo = false,
  onUndo,
  onRedo,
  onExport,
  onClose,
  onSwitchboardLinkClick,
  onHistoryClick,
  timelineItems = [],
  children,
  ...containerProps
}) => {
  const [showTimeline, setShowTimeline] = useState(initialTimelineVisible);

  const isUndoDisabled = !canUndo;
  const isRedoDisabled = !canRedo;
  const isTimelineDisabled = timelineItems.length === 0;

  const handleTimelineToggle = () => {
    if (isTimelineDisabled) return;
    setShowTimeline(!showTimeline);
  };

  return (
    <div className="flex w-full flex-col" {...containerProps}>
      <div
        className={twMerge(
          "flex h-12 w-full items-center justify-between rounded-xl border border-gray-200 bg-slate-50 px-4",
          className,
        )}
      >
        <div className="flex items-center gap-x-2">
          {enabledControls.includes("undo") && (
            <button
              className={twMerge(
                "grid size-8 place-items-center rounded-lg border border-gray-200 bg-white",
                isUndoDisabled
                  ? "cursor-not-allowed"
                  : "cursor-pointer active:opacity-70",
              )}
              onClick={onUndo}
              disabled={isUndoDisabled}
            >
              <Icon
                name="ArrowCouterclockwise"
                size={16}
                className={isUndoDisabled ? "text-gray-500" : "text-gray-900"}
              />
            </button>
          )}
          {enabledControls.includes("redo") && (
            <button
              className={twMerge(
                "grid size-8 place-items-center rounded-lg border border-gray-200 bg-white",
                isRedoDisabled
                  ? "cursor-not-allowed"
                  : "cursor-pointer active:opacity-70",
              )}
              onClick={onRedo}
              disabled={isRedoDisabled}
            >
              <div className="-scale-x-100">
                <Icon
                  name="ArrowCouterclockwise"
                  size={16}
                  className={isRedoDisabled ? "text-gray-500" : "text-gray-900"}
                />
              </div>
            </button>
          )}
          {enabledControls.includes("export") && (
            <button
              className="flex h-8 cursor-pointer items-center rounded-lg border border-gray-200 bg-white px-3 text-sm active:opacity-70"
              onClick={onExport}
            >
              <span className="text-gray-900">Export</span>
            </button>
          )}
        </div>

        <div className="flex items-center">
          <h1 className="text-sm font-medium text-gray-500">{documentName}</h1>
        </div>

        <div className="flex items-center gap-x-2">
          {showSwitchboardLink && (
            <button
              className="grid size-8 cursor-pointer place-items-center rounded-lg border border-gray-200 bg-white active:opacity-70"
              onClick={onSwitchboardLinkClick}
            >
              <Icon name="Drive" size={16} className="text-gray-900" />
            </button>
          )}
          {enabledControls.includes("history") && (
            <button
              className={twMerge(
                "grid size-8 place-items-center rounded-lg border border-gray-200 bg-white",
                disableRevisionHistory
                  ? "cursor-not-allowed"
                  : "cursor-pointer active:opacity-70",
              )}
              onClick={onHistoryClick}
              disabled={disableRevisionHistory}
            >
              <Icon
                name="History"
                size={16}
                className={
                  disableRevisionHistory ? "text-gray-500" : "text-gray-900"
                }
              />
            </button>
          )}
          {enabledControls.includes("timeline") && defaultTimelineVisible && (
            <button
              className={twMerge(
                "grid size-8 place-items-center rounded-lg border border-gray-200 bg-white",
                isTimelineDisabled
                  ? "cursor-not-allowed"
                  : "cursor-pointer active:opacity-70",
              )}
              onClick={handleTimelineToggle}
              disabled={isTimelineDisabled}
              aria-pressed={showTimeline}
            >
              <Icon
                name="Timeline"
                size={16}
                className={twMerge(
                  "text-gray-900",
                  isTimelineDisabled && "opacity-50",
                  showTimeline && "text-blue-600",
                )}
              />
            </button>
          )}
          <button
            aria-label="Close document"
            className="grid size-8 cursor-pointer place-items-center rounded-lg border border-gray-200 bg-white active:opacity-70"
            onClick={onClose}
          >
            <Icon name="XmarkLight" size={16} className="text-gray-900" />
          </button>
        </div>
      </div>

      {showTimeline && timelineItems.length > 0 && (
        <div className="mt-2 w-full">
          <DocumentTimeline timeline={timelineItems} onItemClick={fn()} />
        </div>
      )}
      {children}
    </div>
  );
};

const meta: Meta<typeof DocumentToolbarStory> = {
  title: "Connect/Components/Document Toolbar",
  component: DocumentToolbarStory,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    documentName: {
      control: "text",
      description: "The name of the document displayed in the toolbar",
    },
    enabledControls: {
      control: "check",
      options: ["undo", "redo", "export", "history", "timeline"],
      description: "Controls which buttons are shown in the toolbar",
    },
    canUndo: {
      control: "boolean",
      description: "Whether the undo button is enabled",
    },
    canRedo: {
      control: "boolean",
      description: "Whether the redo button is enabled",
    },
    disableRevisionHistory: {
      control: "boolean",
      description: "Whether the revision history button is disabled",
    },
    showSwitchboardLink: {
      control: "boolean",
      description: "Whether to show the switchboard link button",
    },
    defaultTimelineVisible: {
      control: "boolean",
      description: "Whether the timeline toggle button is visible",
    },
    initialTimelineVisible: {
      control: "boolean",
      description: "Whether the timeline is expanded by default",
    },
  },
};

export default meta;
type Story = StoryObj<typeof DocumentToolbarStory>;

export const Default: Story = {
  args: {
    documentName: "My Document",
    enabledControls: ["undo", "redo", "export", "history"],
    canUndo: true,
    canRedo: false,
    onUndo: fn(),
    onRedo: fn(),
    onExport: fn(),
    onClose: fn(),
    onHistoryClick: fn(),
  },
};

export const AllControlsEnabled: Story = {
  args: {
    documentName: "todo-document",
    enabledControls: ["undo", "redo", "export", "history", "timeline"],
    canUndo: true,
    canRedo: true,
    showSwitchboardLink: true,
    defaultTimelineVisible: true,
    onUndo: fn(),
    onRedo: fn(),
    onExport: fn(),
    onClose: fn(),
    onHistoryClick: fn(),
    onSwitchboardLinkClick: fn(),
    timelineItems: [
      {
        id: "1",
        type: "divider",
        title: "Created document",
        timestampUtcMs: new Date("2024-01-15T10:00:00").getTime().toString(),
      },
      {
        id: "2",
        type: "bar",
        addSize: 2,
        delSize: 0,
        additions: 15,
        deletions: 0,
        timestampUtcMs: new Date("2024-01-15T10:30:00").getTime().toString(),
      },
      {
        id: "3",
        type: "bar",
        addSize: 3,
        delSize: 1,
        additions: 25,
        deletions: 5,
        timestampUtcMs: new Date("2024-01-15T11:00:00").getTime().toString(),
      },
    ],
  },
};

export const UndoRedoDisabled: Story = {
  args: {
    documentName: "New Document",
    enabledControls: ["undo", "redo", "export", "history"],
    canUndo: false,
    canRedo: false,
    onUndo: fn(),
    onRedo: fn(),
    onExport: fn(),
    onClose: fn(),
    onHistoryClick: fn(),
  },
};

export const MinimalControls: Story = {
  args: {
    documentName: "Read Only Document",
    enabledControls: ["export"],
    onExport: fn(),
    onClose: fn(),
  },
};

export const WithSwitchboardLink: Story = {
  args: {
    documentName: "Remote Document",
    enabledControls: ["undo", "redo", "export", "history"],
    canUndo: true,
    canRedo: false,
    showSwitchboardLink: true,
    onUndo: fn(),
    onRedo: fn(),
    onExport: fn(),
    onClose: fn(),
    onHistoryClick: fn(),
    onSwitchboardLinkClick: fn(),
  },
};

export const WithTimelineExpanded: Story = {
  args: {
    documentName: "Document with Timeline",
    enabledControls: ["undo", "redo", "export", "history", "timeline"],
    canUndo: true,
    canRedo: true,
    defaultTimelineVisible: true,
    initialTimelineVisible: true,
    onUndo: fn(),
    onRedo: fn(),
    onExport: fn(),
    onClose: fn(),
    onHistoryClick: fn(),
    timelineItems: [
      {
        id: "1",
        type: "divider",
        title: "Document created",
        timestampUtcMs: new Date("2024-01-10T09:00:00").getTime().toString(),
      },
      {
        id: "2",
        type: "bar",
        addSize: 4,
        delSize: 0,
        additions: 50,
        deletions: 0,
        timestampUtcMs: new Date("2024-01-10T10:00:00").getTime().toString(),
      },
      {
        id: "3",
        type: "bar",
        addSize: 2,
        delSize: 2,
        additions: 12,
        deletions: 8,
        timestampUtcMs: new Date("2024-01-11T14:00:00").getTime().toString(),
      },
      {
        id: "4",
        type: "divider",
        title: "Final revision",
        timestampUtcMs: new Date("2024-01-12T16:00:00").getTime().toString(),
      },
    ],
  },
};

export const HistoryDisabled: Story = {
  args: {
    documentName: "Local Document",
    enabledControls: ["undo", "redo", "export", "history"],
    canUndo: true,
    canRedo: false,
    disableRevisionHistory: true,
    onUndo: fn(),
    onRedo: fn(),
    onExport: fn(),
    onClose: fn(),
    onHistoryClick: fn(),
  },
};
