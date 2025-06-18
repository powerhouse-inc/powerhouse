import {
  createDocumentStory,
  type DocumentStory,
  type DriveDocumentStory,
  type DriveEditorStoryComponent,
  type EditorStoryArgs,
  type EditorStoryComponent,
  type EditorStoryProps,
} from "@powerhousedao/builder-tools/editor-utils";
import {
  DRIVE,
  DriveContextProvider,
  type UiDriveNode,
  UiNodesContextProvider,
  useUiNodesContext,
} from "@powerhousedao/reactor-browser";
import { type Decorator, type Meta } from "@storybook/react";
import {
  type DocumentDriveDocument,
  type DocumentDriveLocalState,
  type DocumentDriveState,
  driveDocumentModelModule,
  type Node,
} from "document-drive";
import {
  documentModelDocumentModelModule,
  type DocumentModelModule,
  type ExtendedState,
  type PartialState,
} from "document-model";
import { type PropsWithChildren, useEffect, useState } from "react";
import { makeUiDriveNode } from "./uiNodes.js";

// Sets the ui drive nodes for the story
function UINodesSetter(
  props: PropsWithChildren<{
    document: DocumentDriveDocument;
  }>,
) {
  const { document } = props;
  const { setDriveNodes, selectedNode, setSelectedNode } = useUiNodesContext();

  const [uiDriveNode, setUiDriveNode] = useState<UiDriveNode | null>(null);

  useEffect(() => {
    const node = makeUiDriveNode(document);
    setUiDriveNode((prev) => {
      if (JSON.stringify(prev) !== JSON.stringify(node)) {
        return node;
      } else {
        return prev;
      }
    });
  }, [document]);

  useEffect(() => {
    if (
      !selectedNode ||
      (selectedNode.kind === DRIVE && selectedNode.id !== uiDriveNode?.id)
    ) {
      setSelectedNode(uiDriveNode);
    }
  }, [uiDriveNode, selectedNode, setSelectedNode]);

  useEffect(() => {
    setDriveNodes(uiDriveNode ? [uiDriveNode] : []);
  }, [uiDriveNode, setDriveNodes]);

  return null;
}

const UiNodesContextDecorator: Decorator<
  EditorStoryProps<DocumentDriveDocument>
> = (Story, context) => {
  const { document } = context.args;
  return (
    <UiNodesContextProvider>
      <UINodesSetter document={document} />
      <Story />
    </UiNodesContextProvider>
  );
};

const DriveContextDecorator: Decorator<
  EditorStoryProps<DocumentDriveDocument>
> = (Story, context) => {
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
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
        selectedNode,
        selectNode: setSelectedNode,
        useSyncStatus: () => "SUCCESS",
        useDriveDocumentState: () => undefined,
        useDriveDocumentStates: () => [{}, () => Promise.resolve()],
        addFile() {
          throw new Error("addFile not implemented");
        },
        addDocument() {
          throw new Error("addDocument not implemented");
        },
        showCreateDocumentModal(documentModel: DocumentModelModule) {
          return Promise.resolve({
            name: `New ${documentModel.documentModel.name}`,
          });
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
    initialState ??
    {
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
    initialState ??
      {
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
