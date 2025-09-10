import { useDocumentReducer } from "#editor-utils/reducer";
import type { DriveEditorProps } from "@powerhousedao/reactor-browser";
import { useArgs, useChannel } from "@storybook/preview-api";
import type { Decorator, Meta, StoryObj } from "@storybook/react";
import type {
  Action,
  ActionContext,
  CreateState,
  EditorProps,
  PHBaseState,
  PHDocument,
  Reducer,
} from "document-model";
import { baseCreateDocument } from "document-model";
import React, { useState } from "react";
import { useInterval } from "usehooks-ts";

export type EditorStoryArgs = Partial<{
  user: {
    address: string;
    networkId: string;
    chainId: number;
    ens: {
      name: string;
      avatarUrl: string;
    };
  };
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
    backgroundUpdateActions: ((document: PHDocument) => Action)[];
  };
}>;

export type EditorStoryProps = EditorProps & EditorStoryArgs;

export type DriveEditorStoryProps = DriveEditorProps & EditorStoryArgs;

export type EditorStoryComponent = (
  props: EditorStoryProps,
) => React.JSX.Element;

export type DriveEditorStoryComponent = (
  props: DriveEditorStoryProps,
) => React.JSX.Element;

export type DocumentStory = StoryObj<EditorStoryComponent>;

export type DriveDocumentStory = StoryObj<DriveEditorStoryComponent>;

// Default createState function for PHDocument
const defaultPHDocumentCreateState: CreateState = (state) => {
  return state as PHBaseState;
};

export function createDocumentStory(
  Editor: EditorStoryComponent,
  reducer: Reducer<any>,
  initialState: unknown,
  additionalStoryArgs?: EditorStoryArgs,
  decorators?: Decorator<EditorStoryProps>[],
): {
  meta: Meta<typeof Editor>;
  CreateDocumentStory: DocumentStory;
} {
  const meta = {
    component: Editor,
    decorators: [
      (Story, { args }) => {
        return (
          <div
            style={{
              padding: "0",
              height: "100vh",
              color: "black",
              backgroundColor: "white",
            }}
          >
            <Story />
          </div>
        );
      },
      (Story, { args }) => {
        const [, setArgs] = useArgs<typeof args>();
        const emit = useChannel({
          DOCUMENT: (document: PHDocument) => {
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
        if (args.user) {
          context.signer = {
            user: {
              address: args.user.address,
              networkId: args.user.networkId,
              chainId: args.user.chainId,
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
            dispatch(createAction(document as PHDocument));
          });
        }
      }, args.simulateBackgroundUpdates?.backgroundUpdateRate ?? null);

      return <Editor {...args} document={document as PHDocument} />;
    },
    argTypes: {
      document: {
        control: "object",
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

  const CreateDocumentStory: DocumentStory = {
    name: "New document",
    args: {
      document: baseCreateDocument(
        defaultPHDocumentCreateState,
        initialState as Partial<PHBaseState>,
      ),
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
