import type { Meta, StoryObj } from "@storybook/react";
import type { Operation } from "document-model";
import { globalOperations, localOperations } from "./mocks.js";
import nsOperations from "./ns-operations.json";
import { RevisionHistory } from "./revision-history.js";
import skipOperations from "./skip-operations.json";

const meta = {
  title: "Connect/Components/Revision History/Revision History",
  component: RevisionHistory,
} satisfies Meta<typeof RevisionHistory>;

export default meta;

type Story = StoryObj<typeof meta>;

const operations = nsOperations as unknown as {
  global: Operation[];
  local: Operation[];
};

const mockDocumentState = {
  type: "budget",
  version: "1.0.0",
  metadata: {
    title: "MakerDAO Budget",
    lastUpdated: "2024-06-13T14:39:12.936Z",
    author: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  },
  content: {
    totalBudget: 5000000,
    allocations: [
      { category: "Development", amount: 2000000 },
      { category: "Marketing", amount: 1500000 },
      { category: "Operations", amount: 1500000 },
    ],
  },
};

export const Default: Story = {
  args: {
    documentTitle: " MakerDAO/Monetalis RWA Report 050724",
    documentId: "6wYLICDhX5w1Hq7mIo6CRbXUV1I=",
    globalOperations: operations.global,
    localOperations,
    onClose: () => {},
    documentState: mockDocumentState,
    onCopyState: () => console.log("State copied to clipboard!"),
  },
};

export const WithSkippedOperations: Story = {
  args: {
    documentTitle: " MakerDAO/Monetalis RWA Report 050724",
    documentId: "6wYLICDhX5w1Hq7mIo6CRbXUV1I=",
    globalOperations: skipOperations.global as unknown as Operation[],
    localOperations,
    onClose: () => {},
    documentState: mockDocumentState,
    onCopyState: () => console.log("State copied to clipboard!"),
  },
};

export const WithNoItems: Story = {
  args: {
    documentTitle: " MakerDAO/Monetalis RWA Report 050724",
    documentId: "6wYLICDhX5w1Hq7mIo6CRbXUV1I=",
    globalOperations: [],
    localOperations: [],
    onClose: () => {},
    documentState: mockDocumentState,
    onCopyState: () => console.log("State copied to clipboard!"),
  },
};

export const WithOneItem: Story = {
  args: {
    documentTitle: " MakerDAO/Monetalis RWA Report 050724",
    documentId: "6wYLICDhX5w1Hq7mIo6CRbXUV1I=",
    globalOperations: [globalOperations[0]],
    localOperations: [localOperations[0]],
    onClose: () => {},
    documentState: mockDocumentState,
    onCopyState: () => console.log("State copied to clipboard!"),
  },
};

export const WithoutDocumentState: Story = {
  args: {
    documentTitle: " MakerDAO/Monetalis RWA Report 050724",
    documentId: "6wYLICDhX5w1Hq7mIo6CRbXUV1I=",
    globalOperations: operations.global,
    localOperations,
    onClose: () => {},
  },
};
