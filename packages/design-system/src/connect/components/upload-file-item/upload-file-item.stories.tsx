import { type Meta, type StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { UploadFileItem } from "./upload-file-item";

const meta: Meta<typeof UploadFileItem> = {
  title: "Connect/Components/UploadFileItem",
  component: UploadFileItem,
  parameters: {
    layout: "centered",
  },
  argTypes: {
    status: {
      control: "select",
      options: ["success", "failed", "pending", "uploading"],
    },
    documentType: {
      control: "select",
      options: [
        undefined,
        "analytics-processor",
        "relational-processor",
        "codegen-processor",
        "app",
        "document-model",
        "editor",
        "package",
        "subgraph",
      ],
    },
    progress: {
      control: { type: "range", min: 0, max: 100, step: 1 },
    },
  },
  args: {
    fileName: "Document.phdm",
    fileSize: "1.0 MB",
    status: "success",
    onClose: fn(),
    onOpenDocument: fn(),
    onFindResolution: fn(),
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

const Template: Story = {
  args: {},
  decorators: [
    (Story) => (
      <div className="flex h-screen w-[338px] items-center justify-center bg-gray-50 p-8">
        <Story />
      </div>
    ),
  ],
};

export const Success: Story = {
  ...Template,
  args: {
    fileName: "ClydesdaleStatement.phdm",
    fileSize: "2.76 MB",
    status: "success",
    onOpenDocument: fn(),
  },
};

export const Failed: Story = {
  ...Template,
  args: {
    fileName: "subgraph.phdm",
    fileSize: "4 MB",
    status: "failed",
    errorDetails:
      "Upload failed. Install the corresponding drive-app that supports this document.",
  },
};

export const FailedZipFile: Story = {
  ...Template,
  args: {
    fileName: "corrupted-archive.zip",
    fileSize: "2.3 MB",
    status: "failed",
    errorDetails:
      "Can't find end of central directory : is this a zip file ? If it is, see https://stuk.github.io/jszip/documentation/howto/read_zip.html",
  },
};

export const PendingResolution: Story = {
  ...Template,
  args: {
    fileName: "subgraph.phdm",
    fileSize: "2.76 MB",
    status: "pending",
    onFindResolution: fn(),
  },
};

export const Uploading: Story = {
  ...Template,
  args: {
    fileName: "Debt Ceiling.phdm",
    fileSize: "3.1 MB",
    status: "uploading",
    progress: 75,
  },
};

export const UploadingLowProgress: Story = {
  ...Template,
  args: {
    fileName: "Budget Analysis.phdm",
    fileSize: "1.2 MB",
    status: "uploading",
    progress: 25,
  },
};

export const UploadingHighProgress: Story = {
  ...Template,
  args: {
    fileName: "Financial Report.phdm",
    fileSize: "5.8 MB",
    status: "uploading",
    progress: 95,
  },
};

export const WithoutCloseButton: Story = {
  ...Template,
  args: {
    fileName: "Document.phdm",
    fileSize: "1.5 MB",
    status: "success",
    onClose: undefined,
  },
};

export const LongFileName: Story = {
  ...Template,
  args: {
    fileName: "Very Long Document Name That Might Overflow.phdm",
    fileSize: "8.2 MB",
    status: "success",
    onOpenDocument: fn(),
  },
};

export const Interactive: Story = {
  ...Template,
  args: {
    fileName: "Interactive Document.phdm",
    fileSize: "2.1 MB",
    status: "success",
    onOpenDocument: fn(),
    onClose: fn(),
  },
  parameters: {
    docs: {
      description: {
        story:
          "Interactive story with all handlers. You can click the buttons to see the actions in the Actions panel.",
      },
    },
  },
};

export const AppModule: Story = {
  ...Template,
  args: {
    fileName: "MyApp.phdm",
    fileSize: "1.5 MB",
    status: "success",
    documentType: "app",
    onOpenDocument: fn(),
  },
};

export const DocumentModelModule: Story = {
  ...Template,
  args: {
    fileName: "BudgetModel.phdm",
    fileSize: "2.2 MB",
    status: "success",
    documentType: "document-model",
    onOpenDocument: fn(),
  },
};

export const EditorModule: Story = {
  ...Template,
  args: {
    fileName: "CustomEditor.phdm",
    fileSize: "3.1 MB",
    status: "success",
    documentType: "editor",
    onOpenDocument: fn(),
  },
};

export const ProcessorModules: Story = {
  ...Template,
  args: {
    fileName: "DataProcessor.phdm",
    fileSize: "1.8 MB",
    status: "success",
    documentType: "analytics-processor",
    onOpenDocument: fn(),
  },
};

export const PackageModule: Story = {
  ...Template,
  args: {
    fileName: "UtilPackage.phdm",
    fileSize: "0.9 MB",
    status: "success",
    documentType: "package",
    onOpenDocument: fn(),
  },
};

export const SubgraphModule: Story = {
  ...Template,
  args: {
    fileName: "APISubgraph.phdm",
    fileSize: "2.7 MB",
    status: "success",
    documentType: "subgraph",
    onOpenDocument: fn(),
  },
};
