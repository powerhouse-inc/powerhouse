import { utils, EditorProps, OperationScope } from 'document-model/document';
import {
    actions,
    DocumentModelAction,
    DocumentModelState,
    DocumentModelLocalState,
} from 'document-model/document-model';
import { CSSProperties } from 'react';
import { styles, TextInput } from 'document-model-libs/utils';
import { ScopeType } from './editor-schema';
import EditorOperation from './editor-operation';
import { useSchemaEditor } from './useSchemaEditor';
import EditorState from './editor-state';

export type IProps = EditorProps<
    DocumentModelState,
    DocumentModelAction,
    DocumentModelLocalState
>;

function Editor(props: IProps) {
    const theme: styles.ColorTheme = props.context.theme || 'light';
    const scheme = styles.colorScheme[theme];
    const style: CSSProperties = {
        backgroundColor: scheme.bgColor,
        color: scheme.color,
        maxWidth: '60em',
        margin: '1em auto',
        padding: '6em',
        border: '2px solid ' + scheme.border,
        boxShadow: '2px 2px 2px ' + scheme.shadow,
        fontFamily: 'Roboto, sans-serif',
        position: 'relative',
    };

    const { document, dispatch } = props;

    const { state } = document;

    const latestOperation =
        document.operations.global[document.operations.global.length - 1];

    const setModelId = (id: string) => {
        dispatch(actions.setModelId({ id }));
    };

    const setModuleDescription = (description: string) => {
        dispatch(actions.setModelDescription({ description }));
    };

    const setModelExtension = (extension: string) => {
        dispatch(actions.setModelExtension({ extension }));
    };

    const setModelName = (name: string) => {
        dispatch(actions.setModelName({ name }));
        dispatch(actions.setName(name));
    };

    const setAuthorName = (authorName: string) => {
        dispatch(actions.setAuthorName({ authorName }));
    };

    const setAuthorWebsite = (authorWebsite: string) => {
        dispatch(actions.setAuthorWebsite({ authorWebsite }));
    };

    const setStateSchema = (schema: string, scope: ScopeType) => {
        dispatch(actions.setStateSchema({ schema, scope }));
    };

    const setInitialState = (initialValue: string, scope: ScopeType) => {
        dispatch(actions.setInitialState({ initialValue, scope }));
    };

    const addModule = (name: string) => {
        dispatch(actions.addModule({ id: utils.hashKey(), name }));
    };

    const updateModuleName = (id: string, name: string) => {
        dispatch(actions.setModuleName({ id, name }));
    };

    const updateModuleDescription = (id: string, description: string) => {
        dispatch(actions.setModuleDescription({ id, description }));
    };

    const deleteModule = (id: string) => {
        dispatch(actions.deleteModule({ id }));
    };

    const addOperation = (moduleId: string, name: string) => {
        dispatch(actions.addOperation({ id: utils.hashKey(), moduleId, name }));
    };

    const updateOperationName = (id: string, name: string) => {
        dispatch(actions.setOperationName({ id, name }));
    };

    const updateOperationSchema = (id: string, schema: string) => {
        dispatch(actions.setOperationSchema({ id, schema }));
    };

    const updateOperationScope = (id: string, scope: OperationScope) => {
        dispatch(actions.setOperationScope({ id, scope }));
    };

    const deleteOperation = (id: string) => {
        dispatch(actions.deleteOperation({ id }));
    };

    const globalSchema = useSchemaEditor({
        state,
        scope: 'global',
        setInitialState,
        latestOperation,
    });

    const localSchema = useSchemaEditor({
        state,
        scope: 'local',
        setInitialState,
        latestOperation,
    });

    return (
        <div style={{ ...style, minHeight: '70em' }}>
            <TextInput
                autoFocus
                clearOnSubmit={false}
                key="modelName"
                onSubmit={setModelName}
                placeholder="Document Model Name"
                size="larger"
                theme={theme}
                value={state.global.name}
            />
            <div style={{ width: '50%', display: 'inline-block' }}>
                <TextInput
                    autoFocus={false}
                    clearOnSubmit={false}
                    key="modelId"
                    onSubmit={setModelId}
                    placeholder="Model Type"
                    size="small"
                    theme={theme}
                    value={state.global.id}
                />
            </div>
            <TextInput
                autoFocus={false}
                clearOnSubmit={false}
                key="modelDescription"
                onSubmit={setModuleDescription}
                placeholder="Model Description"
                theme={theme}
                value={state.global.description}
            />
            <div style={{ width: '50%', display: 'inline-block' }}>
                <TextInput
                    autoFocus={false}
                    clearOnSubmit={false}
                    key="modelExtension"
                    onSubmit={setModelExtension}
                    placeholder="File Extension(s)"
                    size="small"
                    theme={theme}
                    value={state.global.extension}
                />
            </div>
            <div>
                <p style={{ ...styles.typographySizes.tiny }}>Author</p>
                <div style={{ width: '50%', display: 'inline-block' }}>
                    <TextInput
                        autoFocus={false}
                        clearOnSubmit={false}
                        key="authorName"
                        onSubmit={setAuthorName}
                        placeholder="Author Name"
                        size="small"
                        theme={theme}
                        value={state.global.author.name}
                    />
                </div>
                <div style={{ width: '50%', display: 'inline-block' }}>
                    <TextInput
                        autoFocus={false}
                        clearOnSubmit={false}
                        key="authorWebsite"
                        onSubmit={setAuthorWebsite}
                        placeholder="https://"
                        size="small"
                        theme={theme}
                        value={state.global.author.website || ''}
                    />
                </div>
            </div>
            {!globalSchema.specification ? null : (
                <>
                    <EditorState
                        latestOperation={latestOperation}
                        name={document.state.global.name}
                        schemaHandlers={globalSchema}
                        scope="global"
                        setStateSchema={setStateSchema}
                        theme={theme}
                    />
                    <EditorState
                        latestOperation={latestOperation}
                        name={document.state.global.name}
                        schemaHandlers={localSchema}
                        scope="local"
                        setStateSchema={setStateSchema}
                        theme={theme}
                    />
                    {globalSchema.specification.modules.map((m) => (
                        <div key={m.id}>
                            <TextInput
                                autoFocus={false}
                                clearOnSubmit={false}
                                horizontalLine
                                key={m.id + '#name'}
                                onEmpty={() => deleteModule(m.id)}
                                onSubmit={(name) =>
                                    updateModuleName(m.id, name)
                                }
                                placeholder="Module Name"
                                size="large"
                                theme={theme}
                                value={m.name}
                            />
                            <TextInput
                                autoFocus={false}
                                clearOnSubmit={false}
                                key={m.id + '#description'}
                                onSubmit={(description) =>
                                    updateModuleDescription(m.id, description)
                                }
                                placeholder={
                                    'Module ' + m.name + ' description'
                                }
                                size="small"
                                theme={theme}
                                value={m.description || ''}
                            />
                            {m.operations.map((op) => (
                                <EditorOperation
                                    id={op.id}
                                    key={op.id}
                                    name={op.name}
                                    onDelete={deleteOperation}
                                    onUpdateName={updateOperationName}
                                    onUpdateSchema={updateOperationSchema}
                                    onUpdateScope={updateOperationScope}
                                    schema={op.schema}
                                    scope={op.scope}
                                    theme={theme}
                                />
                            ))}
                            <TextInput
                                autoFocus={false}
                                clearOnSubmit
                                key={m.id + '#newOperation'}
                                onSubmit={(name) => addOperation(m.id, name)}
                                placeholder="Add operation..."
                                size="medium"
                                theme={theme}
                            />
                        </div>
                    ))}
                </>
            )}
            <TextInput
                autoFocus={false}
                clearOnSubmit
                horizontalLine
                key="newModule"
                onSubmit={addModule}
                placeholder="Module Name"
                size="large"
                theme={theme}
            />
        </div>
    );
}

export default Editor;
