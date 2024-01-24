import { OperationScope, Operation, BaseAction } from 'document-model/document';
import { styles } from 'document-model-editors';
import EditorSchema, { ScopeType } from './editor-schema';
import EditorInitialState from './editor-initital-state';
import { SchemaResult } from './useSchemaEditor';
import { DocumentModelAction } from 'document-model/document-model';

export interface EditorStateProps {
    name: string;
    schemaHandlers: SchemaResult;
    scope: OperationScope;
    theme: styles.ColorTheme;
    setStateSchema: (schema: string, scope: ScopeType) => void;
    latestOperation?: Operation<DocumentModelAction | BaseAction> | null;
}

function EditorState(props: EditorStateProps) {
    const {
        name,
        theme,
        setStateSchema,
        scope,
        schemaHandlers,
        latestOperation,
    } = props;

    const { setInitialValue, setSchemaState, schemaState, specification } =
        schemaHandlers;

    const scopeName = scope === 'local' ? 'Local' : 'Global';

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'flex-start',
            }}
        >
            <div
                style={{
                    width: '50%',
                    display: 'inline-block',
                }}
            >
                <h4 style={{ marginBottom: '16px' }}>
                    {`${scopeName} State Schema`}
                </h4>
                <EditorSchema
                    scope={scope}
                    name={name}
                    value={specification?.state[scope].schema}
                    onGenerate={schema => {
                        setSchemaState(_state => ({
                            ..._state,
                            ...schema,
                        }));
                        if (
                            schema.schema !== specification?.state[scope].schema
                        ) {
                            setStateSchema(schema.schema, scope);
                        }
                    }}
                    theme={theme}
                    height={200}
                />
            </div>
            <div
                style={{
                    width: '50%',
                    display: 'inline-block',
                }}
            >
                <h4
                    style={{ marginBottom: '16px' }}
                >{`${scopeName} Initial State`}</h4>
                <EditorInitialState
                    height={200}
                    setInitialValue={
                        latestOperation?.type === 'SET_INITIAL_STATE' &&
                        latestOperation.scope === scope
                    }
                    value={specification?.state[scope].initialValue}
                    validator={schemaState?.validator}
                    onCreate={value => {
                        setInitialValue(JSON.parse(value) as JSON);
                    }}
                    theme={theme}
                />
            </div>
        </div>
    );
}

export default EditorState;
