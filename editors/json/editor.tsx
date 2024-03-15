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

export default function Editor({ dispatch, document, editorContext }: IProps) {
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
        <DocumentEditor mode={editorContext.theme}>
            <EditorToolbar
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
                center={[
                    <ToolbarButton
                        key="save"
                        onClick={() => handleSave(state as JSON)}
                    >
                        Save
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
                        placeholder="Document name"
                        value={document.name}
                        size="medium"
                        theme={editorContext.theme}
                        onSubmit={handleSetDocumentName}
                    />
                </div>
                <JSONEditor
                    value={state as JSON}
                    theme={editorContext.theme}
                    onBlur={value => handleSave(value)}
                    onChange={value => setState(value || {})}
                />
            </EditorWorksheet>
        </DocumentEditor>
    );
}
