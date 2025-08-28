import { type Meta } from "@storybook/react";
import { createDriveStory } from "../utils/storybook.js";
import Editor from "./editor.js";

const { meta: _meta, CreateDocumentStory } = createDriveStory(Editor);

const meta = {
  ..._meta,
  title: "Generic Drive Explorer",
} as Meta<typeof Editor>;
export const Empty: any = CreateDocumentStory;

export default meta;
