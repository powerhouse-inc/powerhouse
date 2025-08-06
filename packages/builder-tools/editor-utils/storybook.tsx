import { useDocumentReducer } from "#editor-utils/reducer";
import { type DriveEditorProps } from "@powerhousedao/reactor-browser";
import { useArgs, useChannel } from "@storybook/preview-api";
import { type Decorator, type Meta, type StoryObj } from "@storybook/react";
import {
  baseCreateDocument,
  type Action,
  type ActionContext,
  type EditorProps,
  type ExtendedState,
  type GlobalStateFromDocument,
  type LocalStateFromDocument,
  type PHDocument,
  type PartialState,
  type Reducer,
} from "document-model";
import React, { useState } from "react";
import { useInterval } from "usehooks-ts";

export type EditorStoryArgs<TDocument extends PHDocument> = Partial<{
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
    backgroundUpdateActions: ((document: TDocument) => Action)[];
  };
}>;

export type EditorStoryProps<TDocument extends PHDocument> =
  EditorProps<TDocument> & EditorStoryArgs<TDocument>;

export type DriveEditorStoryProps<TDocument extends PHDocument> =
  DriveEditorProps<TDocument> & EditorStoryArgs<TDocument>;

export type EditorStoryComponent<TDocument extends PHDocument> = (
  props: EditorStoryProps<TDocument>,
) => React.JSX.Element;

export type DriveEditorStoryComponent<TDocument extends PHDocument> = (
  props: DriveEditorStoryProps<TDocument>,
) => React.JSX.Element;

export type DocumentStory<TDocument extends PHDocument> = StoryObj<
  EditorStoryComponent<TDocument>
>;

export type DriveDocumentStory<TDocument extends PHDocument> = StoryObj<
  DriveEditorStoryComponent<TDocument>
>;

export function createDocumentStory<TDocument extends PHDocument>(
  Editor: EditorStoryComponent<TDocument>,
  reducer: Reducer<TDocument>,
  initialState: Partial<
    ExtendedState<
      PartialState<GlobalStateFromDocument<TDocument>>,
      PartialState<LocalStateFromDocument<TDocument>>
    >
  >,
  additionalStoryArgs?: EditorStoryArgs<TDocument>,
  decorators?: Decorator<EditorStoryProps<TDocument>>[],
): {
  meta: Meta<typeof Editor>;
  CreateDocumentStory: DocumentStory<TDocument>;
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
          DOCUMENT: (document: TDocument) => {
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
      function dispatch(action: Action) {
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

  const CreateDocumentStory: DocumentStory<TDocument> = {
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

// export function createDriveDocumentStory<TDocument extends PHDocument>(
//   Editor: DriveEditorStoryComponent<TDocument>,
//   reducer: Reducer<TDocument>,
//   initialState: Partial<
//     ExtendedState<
//       PartialState<GlobalStateFromDocument<TDocument>>,
//       PartialState<LocalStateFromDocument<TDocument>>
//     >
//   >,
//   additionalStoryArgs?: EditorStoryArgs<TDocument>,
//   decorators?: Decorator<EditorStoryProps<TDocument>>[],
// ): {
//   meta: Meta<typeof Editor>;
//   CreateDocumentStory: DocumentStory<TDocument>;
// } {
//   const meta = {
//     component: Editor,
//     decorators: [
//       (Story, { args }) => {
//         const darkTheme = args.context.theme === "dark";
//         return (
//           <div
//             style={{
//               padding: "0",
//               height: "100vh",
//               color: darkTheme ? "white" : "black",
//               backgroundColor: darkTheme ? "#1A1D1F" : "white",
//             }}
//           >
//             <Story />
//           </div>
//         );
//       },
//       (Story, { args }) => {
//         const [, setArgs] = useArgs<typeof args>();
//         const emit = useChannel({
//           DOCUMENT: (document: TDocument) => {
//             setArgs({ document });
//           },
//         });

//         return <Story emit={emit} />;
//       },
//       ...(decorators ?? []),
//     ],
//     render: function Render(args) {
//       const [error, setError] = useState<unknown>();
//       const emit = useChannel({});

//       const [document, _dispatch] = useDocumentReducer(
//         reducer,
//         args.document,
//         (error) => {
//           console.error(error);
//           setError(error);
//         },
//       );
//       function dispatch(action: Action) {
//         const context: ActionContext = {};
//         if (args.context.user) {
//           context.signer = {
//             user: {
//               address: args.context.user.address,
//               networkId: args.context.user.networkId,
//               chainId: args.context.user.chainId,
//             },
//             app: {
//               name: "storybook",
//               key: "storybook",
//             },
//             signatures: [],
//           };
//         }
//         return _dispatch({
//           ...action,
//           context,
//         });
//       }

//       //  resets the budget state in the reducer when the prop changes
//       React.useEffect(() => {
//         if (document) {
//           emit("DOCUMENT", document);
//         }
//         setError(undefined);
//       }, [document, emit]);

//       useInterval(() => {
//         if (args.simulateBackgroundUpdates) {
//           const { backgroundUpdateActions } = args.simulateBackgroundUpdates;
//           backgroundUpdateActions.forEach((createAction) => {
//             dispatch(createAction(document));
//           });
//         }
//       }, args.simulateBackgroundUpdates?.backgroundUpdateRate ?? null);

//       return (
//         <Editor
//           {...args}
//           dispatch={dispatch}
//           document={document}
//           error={error}
//         />
//       );
//     },
//     argTypes: {
//       document: {
//         control: "object",
//       },
//       dispatch: {
//         table: {
//           disable: true,
//         },
//       },
//       context: {
//         theme: {
//           name: "Theme",
//           options: ["light", "dark"],
//           defaultValue: "light",
//           control: "inline-radio",
//         },
//         user: {
//           control: "object",
//         },
//       },
//     },
//   } satisfies Meta<typeof Editor>;

//   const CreateDocumentStory: DriveDocumentStory<TDocument> = {
//     name: "New document",
//     args: {
//       document: baseCreateDocument(initialState),
//       context: {
//         theme: "light",
//         user: {
//           address: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
//           networkId: "eip155",
//           chainId: 1,
//           ens: {
//             name: "vitalik.eth",
//             avatarUrl:
//               "https://ipfs.io/ipfs/QmSP4nq9fnN9dAiCj42ug9Wa79rqmQerZXZch82VqpiH7U/image.gif",
//           },
//         },
//       },
//       ...additionalStoryArgs,
//     },
//   };

//   return { meta, CreateDocumentStory } as const;
// }
