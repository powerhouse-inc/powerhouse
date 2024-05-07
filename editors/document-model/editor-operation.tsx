import { TextInput, styles } from 'document-model-libs/utils';
import GraphQLEditor from '../common/graphql-editor';
import { pascalCase } from 'change-case';
import { OperationScope } from 'document-model/document';
import { ConstrainedEditorRestriction } from 'constrained-editor-plugin';

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

type SchemaAndRestrictionsType = {
    schema: string;
    restrictions?: ConstrainedEditorRestriction[];
};

const getSchemaAndRestrictions = (
    schema: IProps['schema'],
    name: IProps['name'],
): SchemaAndRestrictionsType => {
    const inputDeclaration = `input ${pascalCase(name || '')}Input {`;

    if (!schema) {
        return {
            restrictions: [
                {
                    range: [1, 1, 1, 1],
                    allowMultiline: true,
                },
                {
                    range: [2, 1, 6, 1],
                    allowMultiline: true,
                },
            ],
            schema: `${inputDeclaration}
    # add your code here
}

# add new types here
`,
        };
    }

    // split schema into lines
    const lines = schema.split('\n');

    // get the line where the input declaration is contained
    const inputDeclarationLine = lines.find(line =>
        line.includes(inputDeclaration),
    );
    const inputDeclarationStartIndex =
        lines.findIndex(line => line.includes(inputDeclaration)) + 1;

    // if the input declaration is not found, return the schema as is with no restrictions
    if (!inputDeclarationLine) {
        return {
            restrictions: undefined,
            schema,
        };
    }

    // get the position where the input declaration starts
    const inputDeclarationStart =
        inputDeclarationLine.indexOf(inputDeclaration) + 1;

    return {
        schema,
        restrictions: [
            {
                range: [
                    1,
                    1,
                    inputDeclarationStartIndex,
                    inputDeclarationStart,
                ],
                allowMultiline: true,
            },
            {
                range: [inputDeclarationStartIndex + 1, 1, lines.length, 1],
                allowMultiline: true,
            },
        ],
    };
};

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

    const { schema: normalizedSchema, restrictions } = getSchemaAndRestrictions(
        schema,
        name,
    );

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
                schema={normalizedSchema}
                onSchemaChange={(schema, sdl) => onUpdateSchema(id, sdl)}
                restrictions={restrictions}
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
