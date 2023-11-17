import { TextInput, styles } from 'document-model-editors';
import GraphQLEditor from './graphql-editor';
import { pascalCase } from 'change-case';
import { OperationScope } from 'document-model/document';

interface IProps {
    id: string;
    name: string | null;
    schema: string | null;
    scope: OperationScope | null;
    onUpdateName: (id: string, name: string) => void;
    onDelete: (id: string) => void;
    onUpdateSchema: (id: string, schema: string) => void;
    onUpdateScope: (id: string, scope: OperationScope) => void;
    theme: styles.ColorTheme;
}

const scopes: OperationScope[] = ['global', 'local'];

export default function EditorOperation(props: IProps) {
    const {
        id,
        name,
        theme,
        onUpdateName,
        onDelete,
        schema,
        onUpdateSchema,
        scope,
        onUpdateScope,
    } = props;
    return (
        <div>
            <TextInput
                key={id + '#name'}
                theme={theme}
                autoFocus={false}
                onSubmit={name => onUpdateName(id, name)}
                onEmpty={() => onDelete(id)}
                value={name || ''}
                clearOnSubmit={false}
                size="medium"
            />
            <label
                style={{ marginLeft: 22, marginBottom: 8, display: 'block' }}
            >
                Schema:
            </label>
            <GraphQLEditor
                theme={theme}
                key={id + '#schema'}
                schema={
                    schema ||
                    `input ${pascalCase(name || '')}Input {

}`
                }
                onChange={schema => onUpdateSchema(id, schema)}
            />
            <div>
                <label
                    htmlFor={`select-${id}`}
                    style={{ marginLeft: 22, marginRight: 8 }}
                >
                    Scope:
                </label>
                <select
                    id={`select-${id}`}
                    value={scope || 'global'}
                    onChange={event =>
                        onUpdateScope(
                            id,
                            event.currentTarget.value as OperationScope,
                        )
                    }
                >
                    {scopes.map(scope => (
                        <option key={scope} value={scope}>
                            {scope[0].toUpperCase()}
                            {scope.slice(1)}
                        </option>
                    ))}
                </select>
            </div>
        </div>
    );
}
