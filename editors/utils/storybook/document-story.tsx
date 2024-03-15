/* eslint-disable react-hooks/rules-of-hooks */
import { useArgs, useChannel } from '@storybook/preview-api';
import { Meta, ReactRenderer } from '@storybook/react';
import { type StoryAnnotations } from '@storybook/types';
import {
    Action,
    BaseAction,
    Document,
    EditorContext,
    ExtendedState,
    Reducer,
    utils,
} from 'document-model/document';
import React, { useState } from 'react';
import { useDocumentReducer } from '../reducer';
import { EditorProps } from '../types';

export type DocumentStory<S, A extends Action, LocalState> = StoryAnnotations<
    ReactRenderer,
    {
        document: Document<S, A, LocalState>;
        dispatch: (action: A | BaseAction) => void;
        editorContext: EditorContext;
    }
>;

export function createDocumentStory<S, A extends Action, L = unknown>(
    Editor: (props: EditorProps<S, A, L>) => React.JSX.Element,
    reducer: Reducer<S, A, L>,
    initialState: ExtendedState<Partial<S>>,
) {
    const meta = {
        component: Editor,
        render: () => {
            const [args, setArgs] = useArgs<EditorProps<S, A, L>>();
            const [error, setError] = useState<unknown>();
            const emit = useChannel({});

            const [state, dispatch] = useDocumentReducer(
                reducer,
                args.document,
                error => {
                    console.error(error);
                    setError(error);
                },
            );
            //  resets the budget state in the reducer when the prop changes
            React.useEffect(() => {
                if (state) {
                    setArgs({ document: state });
                    emit('DOCUMENT', state);
                }
                setError(undefined);
            }, [state]);

            const darkTheme = args.editorContext.theme === 'dark';
            return (
                <div
                    style={{
                        padding: '0',
                        height: '100vh',
                        color: darkTheme ? 'white' : 'black',
                        backgroundColor: darkTheme ? '#1A1D1F' : 'white',
                    }}
                >
                    <Editor {...args} dispatch={dispatch} error={error} />
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
            editorContext: {
                name: 'Theme',
                options: ['light', 'dark'],
                mapping: {
                    light: {
                        theme: 'light',
                    },
                    dark: {
                        theme: 'dark',
                    },
                },
                defaultValue: {
                    theme: 'light',
                },
                control: 'inline-radio',
            },
        },
    } satisfies Meta<typeof Editor>;

    const CreateDocumentStory: DocumentStory<S, A, unknown> = {
        name: 'New document',
        args: {
            document: utils.createDocument(initialState),
            editorContext: {
                theme: 'light',
            },
        },
    };

    return { meta, CreateDocumentStory } as const;
}
