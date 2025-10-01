import type { DocumentStory } from "@powerhousedao/builder-tools";
import {
  type EditorStoryArgs,
  type EditorStoryProps,
  createDocumentStory,
} from "@powerhousedao/builder-tools";
import type { Decorator, Meta } from "@storybook/react";
import { driveDocumentModelModule } from "document-drive";
import { defaultBaseState } from "document-model/core";
import { Editor } from "./editor.js";

function createDriveStory<T extends (props: any) => React.JSX.Element>(
  Editor: T,
  initialState?: any,
  additionalStoryArgs?: EditorStoryArgs,
  decorators?: Decorator<EditorStoryProps>[],
): {
  meta: Meta<T>;
  CreateDocumentStory: DocumentStory;
} {
  const story = createDocumentStory(
    Editor,
    initialState ??
      driveDocumentModelModule.utils.createState({
        ...defaultBaseState(),
        global: { name: "Powerhouse", icon: "POWERHOUSE", nodes: [] },
        local: {
          availableOffline: false,
          listeners: [],
          sharingType: "PUBLIC",
          triggers: [],
        },
      }),
    additionalStoryArgs,
  );
  return story as {
    meta: Meta<T>;
    CreateDocumentStory: DocumentStory;
  };
}

const { meta: _meta, CreateDocumentStory } = createDriveStory(Editor);

const meta: Meta<typeof Editor> = {
  ..._meta,
  title: "Generic Drive Explorer",
} as Meta<typeof Editor>;
export const Empty: any = CreateDocumentStory;

export default meta;
