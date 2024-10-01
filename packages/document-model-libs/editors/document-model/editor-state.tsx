import { OperationScope, Operation, BaseAction } from 'document-model/document';
import { styles } from 'document-model-libs/utils';
import EditorSchema, { ScopeType } from './editor-schema';
import EditorInitialState from './editor-initital-state';
import { SchemaResult } from './useSchemaEditor';
import { DocumentModelAction } from 'document-model/document-model';

export interface EditorStateProps {
    readonly name: string;
    readonly schemaHandlers: SchemaResult;
    readonly scope: OperationScope;
    readonly theme: styles.ColorTheme;
    readonly setStateSchema: (schema: string, scope: ScopeType) => void;
    readonly latestOperation?: Operation<
        DocumentModelAction | BaseAction
    > | null;
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
                    height={200}
                    name={name}
                    onGenerate={(schema) => {
                        setSchemaState((_state) => ({
                            ..._state,
                            ...schema,
                        }));
                        if (
                            schema.schema !== specification?.state[scope].schema
                        ) {
                            setStateSchema(schema.schema, scope);
                        }
                    }}
                    scope={scope}
                    theme={theme}
                    value={specification?.state[scope].schema}
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
                    onCreate={(value) => {
                        setInitialValue(JSON.parse(value) as JSON);
                    }}
                    setInitialValue={
                        latestOperation?.type === 'SET_INITIAL_STATE' &&
                        latestOperation.scope === scope
                    }
                    theme={theme}
                    validator={schemaState?.validator}
                    value={specification?.state[scope].initialValue}
                />
            </div>
        </div>
    );
}

export default EditorState;
