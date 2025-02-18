import { useArgs, useChannel } from "@storybook/preview-api";
import { Decorator, Meta, StoryObj } from "@storybook/react";
import {
  Action,
  ActionContext,
  BaseAction,
  Document,
  EditorProps,
  ExtendedState,
  PartialState,
  Reducer,
  utils,
} from "document-model/document";
import React, { useState } from "react";
import { useInterval } from "usehooks-ts";
import { useDocumentReducer } from "../reducer";

export type EditorStoryArgs<S, A extends Action, L> = Partial<{
  isAllowedToCreateDocuments: boolean;
  isAllowedToEditDocuments: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onSwitchboardLinkClick: (() => void) | undefined;
  onExport: () => void;
  onClose: () => void;
  onShowRevisionHistory: () => void;
  simulateBackgroundUpdates?: {
    backgroundUpdateRate: number;
    backgroundUpdateActions: ((document: Document<S, A, L>) => A)[];
  };
}>;

export type EditorStoryProps<S, A extends Action, L = unknown> = EditorProps<
  S,
  A,
  L
> &
  EditorStoryArgs<S, A, L>;

export type EditorStoryComponent<S, A extends Action, L = unknown> = (
  props: EditorStoryProps<S, A, L>,
) => React.JSX.Element;

export type DocumentStory<S, A extends Action, LocalState> = StoryObj<
  EditorStoryComponent<S, A, LocalState>
>;

export function createDocumentStory<S, A extends Action, L = unknown>(
  Editor: EditorStoryComponent<S, A, L>,
  reducer: Reducer<S, A, L>,
  initialState: ExtendedState<PartialState<S>, PartialState<L>>,
  additionalStoryArgs?: EditorStoryArgs<S, A, L>,
  decorators?: Decorator<EditorStoryProps<S, A, L>>[],
): { meta: Meta<typeof Editor>; CreateDocumentStory: DocumentStory<S, A, L> } {
  const meta = {
    component: Editor,
    decorators: [
      (Story, { args }) => {
        const darkTheme = args.context.theme === "dark";
        return (
          <div
            style={{
              padding: "0",
              height: "100vh",
              color: darkTheme ? "white" : "black",
              backgroundColor: darkTheme ? "#1A1D1F" : "white",
            }}
          >
            <Story />
          </div>
        );
      },
      (Story, { args }) => {
        const [, setArgs] = useArgs<typeof args>();
        const emit = useChannel({
          DOCUMENT: (document: Document<S, A, L>) => {
            setArgs({ document });
          },
        });

        return <Story emit={emit} />;
      },
      ...(decorators ?? []),
    ],
    render: function Render(args) {
      const [error, setError] = useState<unknown>();
      const emit = useChannel({});

      const [document, _dispatch] = useDocumentReducer(
        reducer,
        args.document,
        (error) => {
          console.error(error);
          setError(error);
        },
      );
      function dispatch(action: A | BaseAction) {
        const context: ActionContext = {};
        if (args.context.user) {
          context.signer = {
            user: {
              address: args.context.user.address,
              networkId: args.context.user.networkId,
              chainId: args.context.user.chainId,
            },
            app: {
              name: "storybook",
              key: "storybook",
            },
            signatures: [],
          };
        }
        return _dispatch({
          ...action,
          context,
        });
      }

      //  resets the budget state in the reducer when the prop changes
      React.useEffect(() => {
        if (document) {
          emit("DOCUMENT", document);
        }
        setError(undefined);
      }, [document, emit]);

      useInterval(() => {
        if (args.simulateBackgroundUpdates) {
          const { backgroundUpdateActions } = args.simulateBackgroundUpdates;
          backgroundUpdateActions.forEach((createAction) => {
            dispatch(createAction(document));
          });
        }
      }, args.simulateBackgroundUpdates?.backgroundUpdateRate ?? null);

      return (
        <Editor
          {...args}
          dispatch={dispatch}
          document={document}
          error={error}
        />
      );
    },
    argTypes: {
      document: {
        control: "object",
      },
      dispatch: {
        table: {
          disable: true,
        },
      },
      context: {
        theme: {
          name: "Theme",
          options: ["light", "dark"],
          defaultValue: "light",
          control: "inline-radio",
        },
        user: {
          control: "object",
        },
      },
    },
  } satisfies Meta<typeof Editor>;

  const CreateDocumentStory: DocumentStory<S, A, L> = {
    name: "New document",
    args: {
      document: utils.createDocument(initialState),
      context: {
        theme: "light",
        user: {
          address: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
          networkId: "eip155",
          chainId: 1,
          ens: {
            name: "vitalik.eth",
            avatarUrl:
              "https://ipfs.io/ipfs/QmSP4nq9fnN9dAiCj42ug9Wa79rqmQerZXZch82VqpiH7U/image.gif",
          },
        },
      },
      ...additionalStoryArgs,
    },
  };

  return { meta, CreateDocumentStory } as const;
}
