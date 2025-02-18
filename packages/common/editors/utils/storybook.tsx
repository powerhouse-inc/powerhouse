import {
  DRIVE,
  UiDriveNode,
  UiNodesContextProvider,
  useUiNodesContext,
} from "@powerhousedao/design-system";
import { Decorator, Meta } from "@storybook/react";
import {
  createDocumentStory,
  DocumentStory,
  EditorStoryArgs,
  EditorStoryComponent,
  EditorStoryProps,
} from "document-model-libs/utils";
import {
  DocumentModel,
  ExtendedState,
  PartialState,
} from "document-model/document";
import { module as DocumentModelModule } from "document-model/document-model";
import * as DocumentDriveModule from "document-models/document-drive";
import {
  DocumentDriveAction,
  DocumentDriveDocument,
  DocumentDriveLocalState,
  DocumentDriveState,
  Node,
} from "document-models/document-drive";
import { DriveContextProvider } from "editors/hooks/useDriveContext";
import { PropsWithChildren, useEffect, useState } from "react";
import { makeUiDriveNode } from "./uiNodes";

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
  EditorStoryProps<
    DocumentDriveState,
    DocumentDriveAction,
    DocumentDriveLocalState
  >
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
  EditorStoryProps<
    DocumentDriveState,
    DocumentDriveAction,
    DocumentDriveLocalState
  >
> = (Story, context) => {
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  return (
    <DriveContextProvider
      value={{
        showSearchBar: false,
        isAllowedToCreateDocuments: true,
        documentModels: [DocumentModelModule as DocumentModel],
        selectedNode,
        selectNode: setSelectedNode,
        addFile() {
          throw new Error("addFile not implemented");
        },
        showCreateDocumentModal(documentModel: DocumentModel) {
          return Promise.resolve({
            name: `New ${documentModel.documentModel.id}`,
          });
        },
      }}
    >
      <Story />
    </DriveContextProvider>
  );
};

export function createDriveStory(
  Editor: EditorStoryComponent<
    DocumentDriveState,
    DocumentDriveAction,
    DocumentDriveLocalState
  >,
  initialState?: ExtendedState<
    PartialState<DocumentDriveState>,
    PartialState<DocumentDriveLocalState>
  >,
  additionalStoryArgs?: EditorStoryArgs<
    DocumentDriveState,
    DocumentDriveAction,
    DocumentDriveLocalState
  >,
  decorators?: Decorator<
    EditorStoryProps<
      DocumentDriveState,
      DocumentDriveAction,
      DocumentDriveLocalState
    >
  >[],
): {
  meta: Meta<typeof Editor>;
  CreateDocumentStory: DocumentStory<
    DocumentDriveState,
    DocumentDriveAction,
    DocumentDriveLocalState
  >;
} {
  return createDocumentStory(
    Editor,
    DocumentDriveModule.reducer,
    initialState ??
      DocumentDriveModule.utils.createExtendedState({
        state: { global: { id: "powerhouse", name: "Powerhouse" }, local: {} },
      }),
    additionalStoryArgs,
    [DriveContextDecorator, ...(decorators ?? [])],
  );
}

export function createDriveStoryWithUINodes(
  Editor: EditorStoryComponent<
    DocumentDriveState,
    DocumentDriveAction,
    DocumentDriveLocalState
  >,
  initialState?: ExtendedState<
    PartialState<DocumentDriveState>,
    PartialState<DocumentDriveLocalState>
  >,
  additionalStoryArgs?: EditorStoryArgs<
    DocumentDriveState,
    DocumentDriveAction,
    DocumentDriveLocalState
  >,
  decorators?: Decorator<
    EditorStoryProps<
      DocumentDriveState,
      DocumentDriveAction,
      DocumentDriveLocalState
    >
  >[],
): {
  meta: Meta<typeof Editor>;
  CreateDocumentStory: DocumentStory<
    DocumentDriveState,
    DocumentDriveAction,
    DocumentDriveLocalState
  >;
} {
  return createDocumentStory(
    Editor,
    DocumentDriveModule.reducer,
    initialState ??
      DocumentDriveModule.utils.createExtendedState({
        state: { global: { id: "powerhouse", name: "Powerhouse" }, local: {} },
      }),
    additionalStoryArgs,
    [DriveContextDecorator, UiNodesContextDecorator, ...(decorators ?? [])],
  );
}
