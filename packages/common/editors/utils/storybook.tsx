import {
  createDocumentStory,
  type DocumentStory,
  type DriveDocumentStory,
  type DriveEditorStoryComponent,
  type EditorStoryArgs,
  type EditorStoryComponent,
  type EditorStoryProps,
} from "@powerhousedao/builder-tools/editor-utils";
import { DriveContextProvider } from "@powerhousedao/reactor-browser";
import { type Decorator, type Meta } from "@storybook/react";
import {
  type DocumentDriveDocument,
  type DocumentDriveLocalState,
  type DocumentDriveState,
  driveDocumentModelModule,
} from "document-drive";
import {
  documentModelDocumentModelModule,
  type DocumentModelModule,
  type ExtendedState,
  type PartialState,
} from "document-model";

const DriveContextDecorator: Decorator<
  EditorStoryProps<DocumentDriveDocument>
> = (Story, context) => {
  return (
    <DriveContextProvider
      value={{
        useDocumentEditorProps: () => ({
          dispatch: () => {},
          document: context.args.document,
          error: undefined,
        }),
        showSearchBar: false,
        isAllowedToCreateDocuments: true,
        documentModels: [
          documentModelDocumentModelModule as DocumentModelModule,
        ],
        useSyncStatus: () => "SUCCESS",
        useDriveDocumentState: () => undefined,
        useDriveDocumentStates: () => [{}, () => Promise.resolve()],
        addFile() {
          throw new Error("addFile not implemented");
        },
        addDocument() {
          throw new Error("addDocument not implemented");
        },
      }}
    >
      <Story />
    </DriveContextProvider>
  );
};

export function createDriveStory(
  Editor: EditorStoryComponent<DocumentDriveDocument>,
  initialState?: ExtendedState<
    PartialState<DocumentDriveState>,
    PartialState<DocumentDriveLocalState>
  >,
  additionalStoryArgs?: EditorStoryArgs<DocumentDriveDocument>,
  decorators?: Decorator<EditorStoryProps<DocumentDriveDocument>>[],
): {
  meta: Meta<typeof Editor>;
  CreateDocumentStory: DocumentStory<DocumentDriveDocument>;
} {
  return createDocumentStory(
    Editor,
    driveDocumentModelModule.reducer,
    initialState ?? {
      ...driveDocumentModelModule.utils.createExtendedState({
        state: { global: { name: "Powerhouse" }, local: {} },
      }),
      id: "powerhouse",
    },
    additionalStoryArgs,
    [DriveContextDecorator, ...(decorators ?? [])],
  );
}

export function createDriveStoryWithUINodes(
  Editor: DriveEditorStoryComponent<DocumentDriveDocument>,
  initialState?: ExtendedState<
    PartialState<DocumentDriveState>,
    PartialState<DocumentDriveLocalState>
  >,
  additionalStoryArgs?: EditorStoryArgs<DocumentDriveDocument>,
  decorators?: Decorator<EditorStoryProps<DocumentDriveDocument>>[],
): {
  meta: Meta<typeof Editor>;
  CreateDocumentStory: DriveDocumentStory<DocumentDriveDocument>;
} {
  const { meta, CreateDocumentStory } = createDocumentStory(
    Editor as EditorStoryComponent<DocumentDriveDocument>,
    driveDocumentModelModule.reducer,
    initialState ?? {
      ...driveDocumentModelModule.utils.createExtendedState({
        state: { global: { name: "Powerhouse" }, local: {} },
      }),
      id: "powerhouse",
    },
    additionalStoryArgs,
    [DriveContextDecorator, UiNodesContextDecorator, ...(decorators ?? [])],
  );

  return {
    meta: meta as Meta<typeof Editor>,
    CreateDocumentStory:
      CreateDocumentStory as DriveDocumentStory<DocumentDriveDocument>,
  };
}
