import type { Meta, StoryObj } from "@storybook/react";
import DropdownMenu from "./dropdown-menu";

const meta: Meta<typeof DropdownMenu> = {
  title: "Document Engineering/Simple Components/Dropdown Menu",
  component: DropdownMenu,
  parameters: {
    layout: "centered",
    chromatic: {
      disableSnapshot: true,
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof DropdownMenu>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {
  args: {
    label: "Export as",
    options: [
      {
        icon: "ExportZip",
        label: "Powerhouse Invoice",
        downloadFileHandler: () => {
          alert("Option 1 clicked");
        },
      },
      {
        label: "UBL file",
        downloadFileHandler: () => {
          console.log("hello");
          alert("Option 2 clicked");
        },
        icon: "ExportUbl",
      },
      {
        label: "Option 3",
        downloadFileHandler: () => {
          alert("Option 3 clicked");
        },
        icon: "ExportPdf",
      },
      {
        label: "Option 4",
        downloadFileHandler: () => {
          alert("Option 4 clicked");
        },
        icon: "ExportCsv",
      },
      {
        label: "Option 5",
        downloadFileHandler: () => {
          alert("Option 5 clicked");
        },
      },
    ],
  },
};

export const WithShortcut: Story = {
  args: {
    label: "Export as",
    options: [
      {
        icon: "ExportZip",
        label: "Option 1",
        downloadFileHandler: () => {
          alert("Option 1 clicked");
        },
        shortcut: "⌘+E",
      },
      {
        icon: "ExportUbl",
        label: "Option 2",
        downloadFileHandler: () => {
          alert("Option 2 clicked");
        },
        shortcut: "⌘+S",
      },
    ],
  },
};
