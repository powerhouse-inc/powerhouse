import {
    actions,
    ScopeFrameworkLocalState,
    ExtendedScopeFrameworkState,
    ScopeFrameworkAction,
    ScopeFrameworkState,
    ScopeFrameworkElementType,
} from '../../document-models/scope-framework';
import { useEffect } from 'react';
import AtlasElement from './components/atlasElement';
import './style.css';
import { EditorProps } from 'document-model/document';
import {
    DocumentEditor,
    EditorToolbar,
    ToolbarButton,
    EditorWorksheet,
    TextInput,
} from 'document-model-editors';

export type IProps = EditorProps<ScopeFrameworkState, ScopeFrameworkAction, ScopeFrameworkLocalState>;

export const randomId = () => {
    return Math.floor(Math.random() * Date.now()).toString(36);
};

const getHighestPathWithPrefix = (prefix: string, paths: string[]) => {
    prefix += '.';
    let result = 0;
    const pLength = prefix.length;

    paths
        .filter(p => p.startsWith(prefix))
        .forEach(p => {
            const value = parseInt(p.slice(pLength).split('.', 2)[0]);
            if (value > result) {
                result = value;
            }
        });

    return result;
};

const getNextPath = (
    extendedState: ExtendedScopeFrameworkState,
    type: ScopeFrameworkElementType,
): string => {
    const result = [extendedState.state.global.rootPath],
        paths = extendedState.state.global.elements.map(e => e.path);

    if (type == 'Scope') {
        result.push(getHighestPathWithPrefix(result[0], paths) + 1 + '');
    }

    if (type == 'Article') {
        result.push(getHighestPathWithPrefix(result[0], paths) + '');
        result.push(getHighestPathWithPrefix(result.join('.'), paths) + 1 + '');
    }

    if (type == 'Section') {
        result.push(getHighestPathWithPrefix(result[0], paths) + '');
        result.push(getHighestPathWithPrefix(result.join('.'), paths) + '');
        result.push(getHighestPathWithPrefix(result.join('.'), paths) + 1 + '');
    }

    if (type == 'Core') {
        result.push(getHighestPathWithPrefix(result[0], paths) + '');
        result.push(getHighestPathWithPrefix(result.join('.'), paths) + '');
        result.push(getHighestPathWithPrefix(result.join('.'), paths) + '');
        result.push(getHighestPathWithPrefix(result.join('.'), paths) + 1 + '');
    }

    return result.join('.');
};

function ScopeFrameworkEditor(props: IProps) {
    const { document, dispatch, editorContext } = props;
    const { state: { global: state} } = document;


    useEffect(() => {
        if (!Object.values(document.operations).concat().length) {
            dispatch(actions.setName('MakerDAO Atlas'));
        }
    }, []);

    const handleNameUpdate = (id: string, name: string) =>
        dispatch(actions.updateElementName({ id, name }));

    const handleTypeUpdate = (id: string, type: ScopeFrameworkElementType) =>
        dispatch(actions.updateElementType({ id, type }));

    const handleComponentsUpdate = (
        id: string,
        components: Record<string, string>,
    ) =>
        dispatch(
            actions.updateElementComponents({
                id,
                components: { content: components.content },
            }),
        );

    const handleDelete = (id: string) => {
        const elements = state.elements.filter(e => e.id == id);
        if (elements.length == 1 && elements[0].type !== 'Scope') {
            dispatch(actions.removeElement({ id }));
        }
    };

    const handleAddArticle = () => {
        dispatch(
            actions.addElement({
                id: randomId(),
                type: 'Article',
                path: getNextPath(document, 'Article'),
                name: null,
                components: {
                    content: null,
                },
            }),
        );
    };

    const handleAddSection = () => {
        dispatch(
            actions.addElement({
                id: randomId(),
                type: 'Section',
                path: getNextPath(document, 'Section'),
                name: null,
                components: {
                    content: null,
                },
            }),
        );
    };

    const handleAddCore = () => {
        dispatch(
            actions.addElement({
                id: randomId(),
                type: 'Core',
                path: getNextPath(document, 'Core'),
                name: null,
                components: {
                    content: null,
                },
            }),
        );
    };

    const handleSetDocumentName = (name: string) => {
        dispatch(actions.setName(name));
    };

    const handleSetRootPath = (newRootPath: string) => {
        dispatch(actions.setRootPath({ newRootPath }));
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
                    <ToolbarButton key="art" onClick={handleAddArticle}>
                        ＋ add article
                    </ToolbarButton>,
                    <ToolbarButton key="sct" onClick={handleAddSection}>
                        ＋ add section
                    </ToolbarButton>,
                    <ToolbarButton key="cor" onClick={handleAddCore}>
                        ＋ add core
                    </ToolbarButton>,
                ]}
                right={[
                    <ToolbarButton key="rev">revision history</ToolbarButton>,
                ]}
            />
            <EditorWorksheet key="sheet">
                <div
                    key="header-left"
                    className="editor-worksheet--header-left"
                >
                    <TextInput
                        key="doc-title"
                        value={document.name}
                        size="huge"
                        theme={editorContext.theme}
                        onSubmit={handleSetDocumentName}
                    />
                    <p key="lastModified">
                        Last Modified:{' '}
                        {document.lastModified
                            .toString()
                            .slice(0, 16)
                            .replace('T', ' ')}{' '}
                        UTC &ndash; Version: {document.revision.global}
                    </p>
                </div>
                <div
                    key="header-right"
                    className="editor-worksheet--header-right"
                >
                    <TextInput
                        key="doc-title"
                        value={state.rootPath}
                        size="medium"
                        theme={editorContext.theme}
                        onSubmit={handleSetRootPath}
                    />
                </div>
                {state.elements.map(d => (
                    <AtlasElement
                        key={d.id}
                        element={d}
                        onUpdateName={handleNameUpdate}
                        onUpdateType={handleTypeUpdate}
                        onUpdateComponents={handleComponentsUpdate}
                        onDelete={handleDelete}
                        mode={props.editorContext.theme}
                    />
                ))}
                {editorContext.debug ? (
                    <code
                        key="stateView"
                        style={{
                            maxWidth: '60em',
                            margin: '4em auto',
                            padding: '2em 0',
                            display: 'block',
                            whiteSpace: 'pre-wrap',
                            fontFamily: 'monospace',
                            lineHeight: '1.7',
                            borderTop: '1px solid #aaa',
                        }}
                    >
                        {JSON.stringify(document, null, 2)}
                    </code>
                ) : (
                    ''
                )}
            </EditorWorksheet>
        </DocumentEditor>
    );
}

export default ScopeFrameworkEditor;
