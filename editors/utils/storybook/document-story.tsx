/* eslint-disable react-hooks/rules-of-hooks */
import { useArgs, useChannel } from '@storybook/preview-api';
import { Meta, ReactRenderer } from '@storybook/react';
import { type StoryAnnotations } from '@storybook/types';
import {
    Action,
    ActionContext,
    BaseAction,
    EditorProps,
    ExtendedState,
    Reducer,
    utils,
} from 'document-model/document';
import React, { useState } from 'react';
import { useDocumentReducer } from '../reducer';

export type DocumentStory<S, A extends Action, LocalState> = StoryAnnotations<
    ReactRenderer,
    EditorArgs<S, A, LocalState>
>;

type EditorComponent<S, A extends Action, L = unknown> = (
    props: EditorProps<S, A, L>,
) => React.JSX.Element;

type EditorArgs<S, A extends Action, L = unknown> = Omit<
    EditorProps<S, A, L>,
    'context'
> &
    Pick<EditorProps<S, A, L>['context'], 'theme' | 'user'>;

function wrapEditor<S, A extends Action, L = unknown>(
    Editor: EditorComponent<S, A, L>,
) {
    const WrappedEditor = (args: EditorArgs<S, A, L>) => {
        const { theme, user, ...restArgs } = args;
        return <Editor {...restArgs} context={{ theme, user }} />;
    };
    return WrappedEditor;
}

export function createDocumentStory<S, A extends Action, L = unknown>(
    Editor: (props: EditorProps<S, A, L>) => React.JSX.Element,
    reducer: Reducer<S, A, L>,
    initialState: ExtendedState<Partial<S>>,
) {
    const meta = {
        component: wrapEditor(Editor),
        render: () => {
            const [args, setArgs] = useArgs<EditorArgs<S, A, L>>();
            const [error, setError] = useState<unknown>();
            const emit = useChannel({});

            const [state, _dispatch] = useDocumentReducer(
                reducer,
                args.document,
                error => {
                    console.error(error);
                    setError(error);
                },
            );

            function dispatch(action: A | BaseAction) {
                const context: ActionContext = {};
                if (args.user) {
                    context.signer = {
                        user: {
                            address: args.user.address,
                            networkId: args.user.networkId,
                            chainId: args.user.chainId,
                        },
                        app: {
                            name: 'storybook',
                            key: 'storybook',
                        },
                        signature: '',
                    };
                }
                return _dispatch({
                    ...action,
                    context,
                });
            }

            //  resets the budget state in the reducer when the prop changes
            React.useEffect(() => {
                if (state) {
                    setArgs({ document: state });
                    emit('DOCUMENT', state);
                }
                setError(undefined);
            }, [state]);

            const darkTheme = args.theme === 'dark';
            const WrappedEditor = wrapEditor(Editor);
            return (
                <div
                    style={{
                        padding: '0',
                        height: '100vh',
                        color: darkTheme ? 'white' : 'black',
                        backgroundColor: darkTheme ? '#1A1D1F' : 'white',
                    }}
                >
                    <WrappedEditor
                        {...args}
                        dispatch={dispatch}
                        error={error}
                    />
                </div>
            );
        },
        argTypes: {
            document: {
                control: 'object',
            },
            dispatch: {
                table: {
                    disable: true,
                },
            },
            theme: {
                name: 'Theme',
                options: ['light', 'dark'],
                defaultValue: 'light',
                control: 'inline-radio',
            },
            user: {
                control: 'object',
            },
        },
    } satisfies Meta<(args: EditorArgs<S, A, L>) => JSX.Element>;

    const CreateDocumentStory: DocumentStory<S, A, unknown> = {
        name: 'New document',
        args: {
            document: utils.createDocument(initialState),
            theme: 'light',
            user: {
                address: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
                networkId: 'eip155',
                chainId: 1,
                ens: {
                    name: 'vitalik.eth',
                    avatarUrl:
                        'https://ipfs.io/ipfs/QmSP4nq9fnN9dAiCj42ug9Wa79rqmQerZXZch82VqpiH7U/image.gif',
                },
            },
        },
    };

    return { meta, CreateDocumentStory } as const;
}
