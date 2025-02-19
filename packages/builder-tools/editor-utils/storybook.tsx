import { useDocumentReducer } from "#editor-utils/reducer";
import { useArgs, useChannel } from "@storybook/preview-api";
import { Decorator, Meta, StoryObj } from "@storybook/react";
import {
  Action,
  ActionContext,
  BaseDocument,
  CustomAction,
  EditorProps,
  ExtendedState,
  PartialState,
  Reducer,
  baseCreateDocument,
} from "document-model";
import React, { useState } from "react";
import { useInterval } from "usehooks-ts";
import { useDocumentReducer } from "../reducer";

type EditorStoryArgs<
  TGlobalState,
  TLocalState,
  TAction extends Action | CustomAction = Action,
> = Partial<{
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
    backgroundUpdateActions: ((
      document: BaseDocument<TGlobalState, TLocalState, TAction>,
    ) => TAction)[];
  };
}>;

type EditorStoryProps<
  TGlobalState,
  TLocalState,
  TAction extends Action | CustomAction = Action,
> = EditorProps<TGlobalState, TLocalState, TAction> &
  EditorStoryArgs<TGlobalState, TLocalState, TAction>;

export type EditorStoryComponent<
  TGlobalState,
  TLocalState,
  TAction extends Action | CustomAction = Action,
> = (
  props: EditorStoryProps<TGlobalState, TLocalState, TAction>,
) => React.JSX.Element;

export type DocumentStory<
  TGlobalState,
  TLocalState,
  TAction extends Action | CustomAction = Action,
> = StoryObj<EditorStoryComponent<TGlobalState, TLocalState, TAction>>;

export function createDocumentStory<
  TGlobalState,
  TLocalState,
  TAction extends Action | CustomAction = Action,
>(
  Editor: EditorStoryComponent<TGlobalState, TLocalState, TAction>,
  reducer: Reducer<TGlobalState, TLocalState, TAction>,
  initialState: ExtendedState<
    PartialState<TGlobalState>,
    PartialState<TLocalState>
  >,
  additionalStoryArgs?: EditorStoryArgs<TGlobalState, TLocalState, TAction>,
  decorators?: Decorator<EditorStoryProps<S, A, L>>[],
): {
  meta: Meta<typeof Editor>;
  CreateDocumentStory: DocumentStory<TGlobalState, TLocalState, TAction>;
} {
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
          DOCUMENT: (
            document: BaseDocument<TGlobalState, TLocalState, TAction>,
          ) => {
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
      function dispatch(action: TAction) {
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

  const CreateDocumentStory: DocumentStory<TGlobalState, TLocalState, TAction> =
    {
      name: "New document",
      args: {
        document: baseCreateDocument(initialState),
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
