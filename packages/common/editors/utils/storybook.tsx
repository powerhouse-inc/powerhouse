import type {
  DocumentStory,
  EditorStoryArgs,
} from "@powerhousedao/builder-tools/editor-utils";
import { createDocumentStory } from "@powerhousedao/builder-tools/editor-utils";
import type { Decorator, Meta } from "@storybook/react";
import { createState } from "document-drive/drive-document-model/gen/index";
import { defaultBaseState } from "document-model";

export function createDriveStory<T extends (props: any) => React.JSX.Element>(
  Editor: T,
  initialState?: any,
  additionalStoryArgs?: EditorStoryArgs,
  decorators?: Decorator[],
): {
  meta: Meta<T>;
  CreateDocumentStory: DocumentStory;
} {
  const story = createDocumentStory(
    Editor,
    initialState ?? createState(defaultBaseState(), { name: "Powerhouse" }),
    additionalStoryArgs,
    [(Story, context) => <Story />, ...(decorators ?? [])],
  );
  return story as {
    meta: Meta<T>;
    CreateDocumentStory: DocumentStory;
  };
}
