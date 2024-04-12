import { utils, EditorProps, OperationScope } from 'document-model/document';
import {
    actions,
    DocumentModelAction,
    DocumentModelState,
    DocumentModelLocalState,
} from 'document-model/document-model';
import { CSSProperties, useEffect } from 'react';
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
        <>
            <div style={{ ...style, minHeight: '70em' }}>
                <TextInput
                    key="modelName"
                    theme={theme}
                    value={state.global.name}
                    placeholder="Document Model Name"
                    autoFocus={true}
                    onSubmit={setModelName}
                    clearOnSubmit={false}
                    size="larger"
                />
                <div style={{ width: '50%', display: 'inline-block' }}>
                    <TextInput
                        key="modelId"
                        theme={theme}
                        value={state.global.id}
                        placeholder="Model Type"
                        autoFocus={false}
                        onSubmit={setModelId}
                        clearOnSubmit={false}
                        size="small"
                    />
                </div>
                <TextInput
                    key="modelDescription"
                    theme={theme}
                    value={state.global.description}
                    placeholder="Model Description"
                    autoFocus={false}
                    onSubmit={setModuleDescription}
                    clearOnSubmit={false}
                />
                <div style={{ width: '50%', display: 'inline-block' }}>
                    <TextInput
                        key="modelExtension"
                        theme={theme}
                        value={state.global.extension}
                        placeholder="File Extension(s)"
                        autoFocus={false}
                        onSubmit={setModelExtension}
                        clearOnSubmit={false}
                        size="small"
                    />
                </div>
                <div>
                    <p style={{ ...styles.typographySizes.tiny }}>Author</p>
                    <div style={{ width: '50%', display: 'inline-block' }}>
                        <TextInput
                            key="authorName"
                            theme={theme}
                            value={state.global.author.name}
                            placeholder="Author Name"
                            autoFocus={false}
                            onSubmit={setAuthorName}
                            clearOnSubmit={false}
                            size="small"
                        />
                    </div>
                    <div style={{ width: '50%', display: 'inline-block' }}>
                        <TextInput
                            key="authorWebsite"
                            theme={theme}
                            value={state.global.author.website || ''}
                            placeholder="https://"
                            autoFocus={false}
                            onSubmit={setAuthorWebsite}
                            clearOnSubmit={false}
                            size="small"
                        />
                    </div>
                </div>
                {!globalSchema.specification ? null : (
                    <>
                        <EditorState
                            scope="global"
                            theme={theme}
                            schemaHandlers={globalSchema}
                            setStateSchema={setStateSchema}
                            name={document.state.global.name}
                            latestOperation={latestOperation}
                        />
                        <EditorState
                            scope="local"
                            theme={theme}
                            schemaHandlers={localSchema}
                            setStateSchema={setStateSchema}
                            name={document.state.global.name}
                            latestOperation={latestOperation}
                        />
                        {globalSchema.specification.modules.map(m => (
                            <div key={m.id}>
                                <TextInput
                                    key={m.id + '#name'}
                                    theme={theme}
                                    placeholder="Module Name"
                                    autoFocus={false}
                                    onSubmit={name =>
                                        updateModuleName(m.id, name)
                                    }
                                    onEmpty={() => deleteModule(m.id)}
                                    value={m.name}
                                    clearOnSubmit={false}
                                    size="large"
                                    horizontalLine={true}
                                />
                                <TextInput
                                    key={m.id + '#description'}
                                    theme={theme}
                                    placeholder={
                                        'Module ' + m.name + ' description'
                                    }
                                    autoFocus={false}
                                    onSubmit={description =>
                                        updateModuleDescription(
                                            m.id,
                                            description,
                                        )
                                    }
                                    value={m.description || ''}
                                    clearOnSubmit={false}
                                    size="small"
                                />
                                {m.operations.map(op => (
                                    <EditorOperation
                                        key={op.id}
                                        id={op.id}
                                        theme={theme}
                                        name={op.name}
                                        schema={op.schema}
                                        scope={op.scope}
                                        onDelete={deleteOperation}
                                        onUpdateName={updateOperationName}
                                        onUpdateSchema={updateOperationSchema}
                                        onUpdateScope={updateOperationScope}
                                    />
                                ))}
                                <TextInput
                                    key={m.id + '#newOperation'}
                                    theme={theme}
                                    autoFocus={false}
                                    placeholder="Add operation..."
                                    onSubmit={name => addOperation(m.id, name)}
                                    clearOnSubmit={true}
                                    size="medium"
                                />
                            </div>
                        ))}
                    </>
                )}
                <TextInput
                    key="newModule"
                    theme={theme}
                    placeholder="Module Name"
                    autoFocus={false}
                    onSubmit={addModule}
                    clearOnSubmit={true}
                    size="large"
                    horizontalLine={true}
                />
            </div>
        </>
    );
}

export default Editor;
