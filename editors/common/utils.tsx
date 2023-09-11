import {
    Document,
    Action,
    ExtendedState,
    Reducer,
    utils,
    BaseAction,
    EditorContext,
} from 'document-model/browser/document';
import { useArgs, useChannel } from '@storybook/preview-api';
import { Meta, ReactRenderer } from '@storybook/react';
import { type StoryAnnotations } from '@storybook/types';
import React from 'react';
import { EditorProps, useDocumentReducer } from '../common';

export type DocumentStory<S, A extends Action> = StoryAnnotations<
    ReactRenderer,
    {
        document: Document<S, A>;
        dispatch: (action: A | BaseAction) => void;
        editorContext: EditorContext;
    }
>;

export function createDocumentStory<S, A extends Action>(
    Editor: (props: EditorProps<S, A>) => React.JSX.Element,
    reducer: Reducer<S, A>,
    initialState: ExtendedState<Partial<S>>,
) {
    const meta = {
        component: Editor,
        render: () => {
            const [args, setArgs] = useArgs<EditorProps<S, A>>();
            const emit = useChannel({});

            const [state, dispatch] = useDocumentReducer(
                reducer,
                args.document,
                console.error,
            );
            //  resets the budget state in the reducer when the prop changes
            React.useEffect(() => {
                if (state) {
                    setArgs({ document: state });
                    emit('DOCUMENT', state);
                }
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
                    <Editor {...args} dispatch={dispatch} />
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

    const CreateDocumentStory: DocumentStory<S, A> = {
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
