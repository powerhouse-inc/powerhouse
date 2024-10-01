import {
    DocumentEditor,
    EditorToolbar,
    EditorWorksheet,
    TextInput,
    ToolbarButton,
} from 'document-model-libs/utils';
import { EditorProps } from 'document-model/document';
import { useEffect } from 'react';
import {
    ExtendedScopeFrameworkState,
    ScopeFrameworkAction,
    ScopeFrameworkElementType,
    ScopeFrameworkLocalState,
    ScopeFrameworkState,
    actions,
} from '../../document-models/scope-framework';
import AtlasElement from './components/atlasElement';
import './style.css';

export type IProps = EditorProps<
    ScopeFrameworkState,
    ScopeFrameworkAction,
    ScopeFrameworkLocalState
>;

export const randomId = () => {
    return Math.floor(Math.random() * Date.now()).toString(36);
};

const getHighestPathWithPrefix = (prefix: string, paths: string[]) => {
    prefix += '.';
    let result = 0;
    const pLength = prefix.length;

    paths
        .filter((p) => p.startsWith(prefix))
        .forEach((p) => {
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
        paths = extendedState.state.global.elements.map((e) => e.path);

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
    const { document, dispatch, context } = props;
    console.log(document);
    const {
        state: { global: state },
    } = document;

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
        const elements = state.elements.filter((e) => e.id == id);
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
        <DocumentEditor mode={context.theme}>
            <EditorToolbar
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
                <div
                    className="editor-worksheet--header-left"
                    key="header-left"
                >
                    <TextInput
                        key="doc-title"
                        onSubmit={handleSetDocumentName}
                        size="huge"
                        theme={context.theme}
                        value={document.name}
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
                    className="editor-worksheet--header-right"
                    key="header-right"
                >
                    <TextInput
                        key="doc-title"
                        onSubmit={handleSetRootPath}
                        size="medium"
                        theme={context.theme}
                        value={state.rootPath}
                    />
                </div>
                {state.elements.map((d) => (
                    <AtlasElement
                        element={d}
                        key={d.id}
                        mode={props.context.theme}
                        onDelete={handleDelete}
                        onUpdateComponents={handleComponentsUpdate}
                        onUpdateName={handleNameUpdate}
                        onUpdateType={handleTypeUpdate}
                    />
                ))}
                {context.debug ? (
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
