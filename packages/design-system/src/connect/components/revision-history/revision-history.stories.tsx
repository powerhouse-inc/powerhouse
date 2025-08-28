import type { Meta, StoryObj } from "@storybook/react";
import type { Operation } from "document-model";
import { globalOperations, localOperations } from "./mocks.js";
// @ts-expect-error - json file needs { with: "json" } but storybook doesn't support it
import nsOperations from "./ns-operations.json";
import { RevisionHistory } from "./revision-history.js";
// @ts-expect-error - json file needs { with: "json" } but storybook doesn't support it
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

export const Default: Story = {
  args: {
    documentTitle: " MakerDAO/Monetalis RWA Report 050724",
    documentId: "6wYLICDhX5w1Hq7mIo6CRbXUV1I=",
    globalOperations: operations.global,
    localOperations,
    onClose: () => {},
  },
};

export const WithSkippedOperations: Story = {
  args: {
    documentTitle: " MakerDAO/Monetalis RWA Report 050724",
    documentId: "6wYLICDhX5w1Hq7mIo6CRbXUV1I=",
    globalOperations: skipOperations.global as unknown as Operation[],
    localOperations,
    onClose: () => {},
  },
};

export const WithNoItems: Story = {
  args: {
    documentTitle: " MakerDAO/Monetalis RWA Report 050724",
    documentId: "6wYLICDhX5w1Hq7mIo6CRbXUV1I=",
    globalOperations: [],
    localOperations: [],
    onClose: () => {},
  },
};

export const WithOneItem: Story = {
  args: {
    documentTitle: " MakerDAO/Monetalis RWA Report 050724",
    documentId: "6wYLICDhX5w1Hq7mIo6CRbXUV1I=",
    globalOperations: [globalOperations[0]],
    localOperations: [localOperations[0]],
    onClose: () => {},
  },
};
