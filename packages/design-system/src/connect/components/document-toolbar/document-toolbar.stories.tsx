import {
  callEventHandlerRegisterFunctions,
  commonGlobalEventHandlerFunctions,
  setDrives,
  setSelectedDrive,
  setSelectedNode,
} from "@powerhousedao/reactor-browser";
import {
  driveCreateDocument,
  type FileNode,
} from "@powerhousedao/shared/document-drive";
import type { PHDocument } from "@powerhousedao/shared/document-model";
import type { Meta, StoryObj } from "@storybook/react";
import { useEffect, useState } from "react";
import { documentModelCreateDocument } from "../../../../../document-model/src/state.js";
import { DocumentToolbar } from "./document-toolbar.js";
import { ToolbarDownloadButton } from "./toolbar-button.js";
import type { DocumentToolbarProps } from "./types.js";

const meta: Meta<typeof DocumentToolbar> = {
  title: "Connect/Components/Document Toolbar",
  component: DocumentToolbar,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<DocumentToolbarProps>;

const mockDocument = documentModelCreateDocument();
const mockNode: FileNode = {
  documentType: mockDocument.header.documentType,
  id: mockDocument.header.id,
  kind: "file",
  name: mockDocument.header.name,
  parentFolder: null,
};
mockDocument.header.name = "Mock document";
const mockDrive = driveCreateDocument({
  global: { nodes: [mockNode], icon: null, name: "Mock drive" },
});

const render = (args: DocumentToolbarProps) => {
  const [hasInit, setHasInit] = useState(false);

  useEffect(() => {
    if (hasInit) return;
    callEventHandlerRegisterFunctions(commonGlobalEventHandlerFunctions);
    setDrives([mockDrive]);
    setSelectedDrive(mockDrive);
    setSelectedNode(mockNode);
    setHasInit(true);
  }, []);

  if (!hasInit) return <div>...loading</div>;

  return <DocumentToolbar {...args} />;
};

const defaultArgs = {
  document: mockDocument,
};

export const Default: Story = {
  args: { ...defaultArgs },
  render,
};

export const WithDisabledControls: Story = {
  args: { ...defaultArgs, disabledControls: ["download", "switchboard"] },
  render,
};

export const WithEnabledControls: Story = {
  args: { ...defaultArgs, enabledControls: ["download", "switchboard"] },
  render,
};

export const WithOneCustomControlInSlot: Story = {
  args: {
    ...defaultArgs,
    customControls: {
      first: {
        component: (props) => (
          <button
            onClick={() => {
              alert(`custom control one in ${props.document?.header.name}`);
            }}
          >
            custom one
          </button>
        ),
      },
      second: {
        position: "end",
        component: (props) => (
          <button
            onClick={() => {
              alert(`custom control two in ${props.document?.header.name}`);
            }}
          >
            custom two
          </button>
        ),
      },
    },
  },
  render,
};

export const WithMultipleCustomControlInSlot: Story = {
  args: {
    ...defaultArgs,
    customControls: {
      first: [
        {
          key: "custom-one",
          component: (props) => (
            <button
              onClick={() => {
                alert(`custom control one in ${props.document?.header.name}`);
              }}
            >
              custom one
            </button>
          ),
        },
        {
          key: "custom-two",
          position: "end",
          component: (props) => (
            <button
              onClick={() => {
                alert(`custom control two in ${props.document?.header.name}`);
              }}
            >
              custom two
            </button>
          ),
        },
      ],
    },
  },
  render,
};

export const WithCustomToolbarContainer: Story = {
  args: {
    ...defaultArgs,
    toolbarContainer: (props) => (
      <div className="bg-amber-300">{props.children}</div>
    ),
  },
  render,
};

export const WithCustomControlsContainer: Story = {
  args: {
    ...defaultArgs,
    controlsContainer: (props) => (
      <div className="bg-cyan-300">{props.children}</div>
    ),
  },
  render,
};

export const WithEnabledAndDisabledControls: Story = {
  args: {
    ...defaultArgs,
    enabledControls: ["download", "switchboard", "close"],
    disabledControls: ["download"],
  },
  render,
};

export const WithCustomDownloadButton: Story = {
  args: {
    ...defaultArgs,
    componentOverrides: {
      download: (props: { document?: PHDocument }) => (
        <ToolbarDownloadButton
          {...props}
          onClick={() => alert(props.document?.header.name)}
        >
          <span>Download??</span>
        </ToolbarDownloadButton>
      ),
    },
  },
  render,
};

export const WithCustomNameInput: Story = {
  args: {
    ...defaultArgs,
    componentOverrides: {
      name: (props) => (
        <textarea
          defaultValue={props.document?.header.name ?? "no name"}
        ></textarea>
      ),
    },
  },
  render,
};

export const WithChildren: Story = {
  args: {
    ...defaultArgs,
    children: <div>I've totally overridden the whole thing</div>,
  },
  render,
};

export const WithCustomStyles: Story = {
  args: {
    ...defaultArgs,
    toolbarClassName: "border-none bg-green-100",
    controlsContainerClassName: "border border-green-300 rounded-lg p-2",
  },
  render,
};
