import { utils, EditorProps } from 'document-model/document';
import {
    actions,
    DocumentModelAction,
    DocumentModelState,
} from 'document-model/document-model';
import { CSSProperties } from 'react';
import { pascalCase } from 'change-case';
import { colorScheme, ColorTheme, typographySizes } from '../common/styles';
import TextInput from '../common/textInput';
import GraphQLEditor from './graphql-editor';

export type IProps = EditorProps<DocumentModelState, DocumentModelAction>;

function Editor(props: IProps) {
    const theme: ColorTheme = props.editorContext.theme || 'light';
    const scheme = colorScheme[theme];
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

    if (document.operations.length < 1) {
        dispatch(actions.setModelId({ id: '' }));
    }

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
    };

    const setAuthorName = (authorName: string) => {
        dispatch(actions.setAuthorName({ authorName }));
    };

    const setAuthorWebsite = (authorWebsite: string) => {
        dispatch(actions.setAuthorWebsite({ authorWebsite }));
    };

    const setStateSchema = (schema: string) => {
        dispatch(actions.setStateSchema({ schema }));
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

    const deleteOperation = (id: string) => {
        dispatch(actions.deleteOperation({ id }));
    };

    return (
        <>
            <div style={{ ...style, minHeight: '70em' }}>
                <TextInput
                    key="modelName"
                    theme={theme}
                    value={state.name}
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
                        value={state.id}
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
                    value={state.description}
                    placeholder="Model Description"
                    autoFocus={false}
                    onSubmit={setModuleDescription}
                    clearOnSubmit={false}
                />
                <div style={{ width: '50%', display: 'inline-block' }}>
                    <TextInput
                        key="modelExtension"
                        theme={theme}
                        value={state.extension}
                        placeholder="File Extension(s)"
                        autoFocus={false}
                        onSubmit={setModelExtension}
                        clearOnSubmit={false}
                        size="small"
                    />
                </div>
                <div>
                    <p style={{ ...typographySizes.tiny }}>Author</p>
                    <div style={{ width: '50%', display: 'inline-block' }}>
                        <TextInput
                            key="authorName"
                            theme={theme}
                            value={state.author.name}
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
                            value={state.author.website || ''}
                            placeholder="https://"
                            autoFocus={false}
                            onSubmit={setAuthorWebsite}
                            clearOnSubmit={false}
                            size="small"
                        />
                    </div>
                </div>
                <div style={{ width: '50%', display: 'inline-block' }}>
                    <h3 style={{ marginBottom: '16px' }}>State Schema</h3>
                    <GraphQLEditor
                        theme={theme}
                        key="modelSchema"
                        schema={
                            state.specifications[0].state.schema ||
                            `type State {
    
}`
                        }
                        onChange={schema => setStateSchema(schema)}
                    />
                </div>
                {state.specifications[0].modules.map(m => (
                    <div key={m.id}>
                        <TextInput
                            key={m.id + '#name'}
                            theme={theme}
                            placeholder="Module Name"
                            autoFocus={false}
                            onSubmit={name => updateModuleName(m.id, name)}
                            onEmpty={() => deleteModule(m.id)}
                            value={m.name}
                            clearOnSubmit={false}
                            size="large"
                            horizontalLine={true}
                        />
                        <TextInput
                            key={m.id + '#description'}
                            theme={theme}
                            placeholder={'Module ' + m.name + ' description'}
                            autoFocus={false}
                            onSubmit={description =>
                                updateModuleDescription(m.id, description)
                            }
                            value={m.description || ''}
                            clearOnSubmit={false}
                            size="small"
                        />
                        {m.operations.map(op => (
                            <div key={op.id}>
                                <TextInput
                                    key={op.id + '#name'}
                                    theme={theme}
                                    autoFocus={false}
                                    onSubmit={name =>
                                        updateOperationName(op.id, name)
                                    }
                                    onEmpty={() => deleteOperation(op.id)}
                                    value={op.name || ''}
                                    clearOnSubmit={false}
                                    size="medium"
                                />
                                <GraphQLEditor
                                    theme={theme}
                                    key={op.id + '#schema'}
                                    schema={
                                        op.schema ||
                                        `input ${pascalCase(
                                            op.name || '',
                                        )}Input {
    
}`
                                    }
                                    onChange={schema =>
                                        updateOperationSchema(op.id, schema)
                                    }
                                />
                            </div>
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
