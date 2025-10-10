import { useSelectedDocument } from "@powerhousedao/reactor-browser";
import { useArgs, useChannel } from "@storybook/preview-api";
import type { Decorator, Meta, StoryObj } from "@storybook/react";
import type {
  Action,
  ActionContext,
  CreateState,
  PHBaseState,
  PHDocument,
} from "document-model";
import { baseCreateDocument } from "document-model/core";
import { useEffect, type ComponentType } from "react";
import { useInterval } from "usehooks-ts";

export type AdditionalEditorStoryArgs = Partial<{
  document: PHDocument;
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

export function createDocumentStory(
  Editor: ComponentType,
  initialState: any,
  additionalStoryArgs?: AdditionalEditorStoryArgs,
  decorators?: Decorator[],
): {
  meta: Meta<typeof Editor>;
  CreateDocumentStory: StoryObj<typeof Editor>;
} {
  const meta = {
    includeStories: ["All"],
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
      const emit = useChannel({});

      // TODO: make args.document the selected document
      const [document, _dispatch] = useSelectedDocument();
      function dispatch(action: Action) {
        const context: ActionContext = {};
        if (additionalStoryArgs?.user) {
          context.signer = {
            user: {
              address: additionalStoryArgs.user.address,
              networkId: additionalStoryArgs.user.networkId,
              chainId: additionalStoryArgs.user.chainId,
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

      // TODO: allow changing document on storybook
      useEffect(() => {
        if (document) {
          emit("DOCUMENT", document);
        }
      }, [document, emit]);

      useInterval(() => {
        if (additionalStoryArgs?.simulateBackgroundUpdates) {
          const { backgroundUpdateActions } =
            additionalStoryArgs.simulateBackgroundUpdates;
          backgroundUpdateActions.forEach((createAction) => {
            dispatch(createAction(document!));
          });
        }
      }, additionalStoryArgs?.simulateBackgroundUpdates?.backgroundUpdateRate ?? null);

      return <Editor {...args} />;
    },
    argTypes: {
      document: {
        control: "object",
      },
      // documentId: "string", TODO allow setting document
      user: {
        control: "object",
      },
    },
  } satisfies Meta<typeof Editor>;

  // Default createState function for PHDocument
  const defaultPHDocumentCreateState = (state: unknown) => {
    return state;
  };

  const CreateDocumentStory: StoryObj<typeof Editor> = {
    name: "New document",
    args: {
      document: baseCreateDocument(
        defaultPHDocumentCreateState as CreateState<PHBaseState>,
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

  return { meta, CreateDocumentStory };
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
