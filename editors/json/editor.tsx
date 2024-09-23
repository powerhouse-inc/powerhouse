import { Action, EditorProps, actions } from 'document-model/document';
import { useEffect, useState } from 'react';
import {
    DocumentEditor,
    EditorToolbar,
    ToolbarButton,
    EditorWorksheet,
    TextInput,
} from 'document-model-libs/utils';
import JSONEditor from '../common/json-editor';

export type IProps = EditorProps<unknown, Action, unknown>;

export default function Editor({ dispatch, document, context }: IProps) {
    const [state, setState] = useState(document.state.global);
    useEffect(() => {
        setState(document.state.global);
    }, [document.state]);

    function handleSave(newState: JSON) {
        dispatch(
            actions.loadState(
                {
                    state: { global: newState, local: document.state.local },
                    name: document.name,
                },
                0,
            ),
        );
    }

    const handleSetDocumentName = (name: string) => {
        dispatch(actions.setName(name));
    };

    return (
        <DocumentEditor mode={context.theme}>
            <EditorToolbar
                center={[
                    <ToolbarButton
                        key="save"
                        onClick={() => handleSave(state as JSON)}
                    >
                        Save
                    </ToolbarButton>,
                ]}
                key="toolbar"
                left={[
                    <ToolbarButton
                        key="undo"
                        onClick={() => dispatch(actions.undo(1))}
                    >
                        ↺ undo
                    </ToolbarButton>,
                    <ToolbarButton
                        key="redo"
                        onClick={() => dispatch(actions.redo(1))}
                    >
                        ↻ redo
                    </ToolbarButton>,
                ]}
                right={[
                    <ToolbarButton key="rev">revision history</ToolbarButton>,
                ]}
            />
            <EditorWorksheet key="sheet">
                <div style={{ marginBottom: '1em' }}>
                    <TextInput
                        key="doc-title"
                        onSubmit={handleSetDocumentName}
                        placeholder="Document name"
                        size="medium"
                        theme={context.theme}
                        value={document.name}
                    />
                </div>
                <JSONEditor
                    onBlur={(value) => handleSave(value)}
                    onChange={(value) => setState(value || {})}
                    theme={context.theme}
                    value={state as JSON}
                />
            </EditorWorksheet>
        </DocumentEditor>
    );
}
