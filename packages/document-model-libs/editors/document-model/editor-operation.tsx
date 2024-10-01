import { TextInput, styles } from 'document-model-libs/utils';
import GraphQLEditor from '../common/graphql-editor';
import { pascalCase } from 'change-case';
import { OperationScope } from 'document-model/document';
import { ConstrainedEditorRestriction } from 'constrained-editor-plugin';

interface IProps {
    readonly id: string;
    readonly name: string | null;
    readonly schema: string | null;
    readonly scope: OperationScope | null;
    readonly onUpdateName: (id: string, name: string) => void;
    readonly onDelete: (id: string) => void;
    readonly onUpdateSchema: (id: string, schema: string) => void;
    readonly onUpdateScope: (id: string, scope: OperationScope) => void;
    readonly theme: styles.ColorTheme;
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
    const inputDeclarationLine = lines.find((line) =>
        line.includes(inputDeclaration),
    );
    const inputDeclarationStartIndex =
        lines.findIndex((line) => line.includes(inputDeclaration)) + 1;

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
                autoFocus={false}
                clearOnSubmit={false}
                key={id + '#name'}
                onEmpty={() => onDelete(id)}
                onSubmit={(name) => onUpdateName(id, name)}
                size="medium"
                theme={theme}
                value={name || ''}
            />
            <label
                style={{ marginLeft: 22, marginBottom: 8, display: 'block' }}
            >
                Schema:
            </label>
            <GraphQLEditor
                key={id + '#schema'}
                onSchemaChange={(schema, sdl) => onUpdateSchema(id, sdl)}
                restrictions={restrictions}
                schema={normalizedSchema}
                theme={theme}
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
                    onChange={(event) =>
                        onUpdateScope(
                            id,
                            event.currentTarget.value as OperationScope,
                        )
                    }
                    value={scope || 'global'}
                >
                    {scopes.map((scope) => (
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
