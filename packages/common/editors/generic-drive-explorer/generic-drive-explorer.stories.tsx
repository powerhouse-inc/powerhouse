import { type EditorStoryComponent } from "@powerhousedao/builder-tools/editor-utils";
import { type Meta } from "@storybook/react";
import { type DocumentDriveDocument } from "document-drive";
import Editor from "./editor.js";
import { createDriveStory } from "../utils/storybook.js";

const { meta: _meta, CreateDocumentStory } = createDriveStory(
  Editor as EditorStoryComponent<DocumentDriveDocument>,
);

const meta = {
  ..._meta,
  title: "Generic Drive Explorer",
} as Meta<typeof Editor>;
export const Empty = CreateDocumentStory;

export default meta;
