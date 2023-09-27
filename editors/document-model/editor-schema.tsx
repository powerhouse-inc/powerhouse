import { GraphQLSchema } from 'graphql';
import { editor } from 'monaco-editor';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import codegen from '../common/codegen';
import { SchemaEditor as Editor, SchemaEditorProps } from '@theguild/editor';
import { pascalCase } from 'change-case';
import { ColorTheme } from '../common/styles';

interface IProps extends SchemaEditorProps {
    name: string;
    onGenerate: (created: {
        documentName: string;
        schema: string;
        validator: () => z.ZodObject<any>;
    }) => void;
    theme: ColorTheme;
}

export default function EditorSchema({
    name,
    onGenerate,
    theme,
    ...props
}: IProps) {
    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

    function focusEditor() {
        setCode(`type ${name} {\n\t\n}`);
        setTimeout(() => {
            editorRef.current?.setPosition({ lineNumber: 2, column: 2 });
            editorRef.current?.focus();
        });
    }

    // useEffect(() => {
    // setCode(defaultCode);
    // if (!name) {
    //     return;
    // }
    // const timeout = setTimeout(() => {
    //     editorRef.current?.setPosition({ lineNumber: 2, column: 2 });
    //     editorRef.current?.focus();
    // }, 500);
    // return () => {
    //     clearTimeout(timeout);
    // };
    // }, [name]);

    const [code, setCode] = useState('');

    useEffect(() => {
        if (!code.includes(`type ${pascalCase(name)}State {`)) {
            setCode(`type ${pascalCase(name)}State {\n\t\n}`);
        }
    }, [name]);

    const [schema, setSchema] = useState<GraphQLSchema>();
    const [validationSchema, setValidationSchema] =
        useState<() => z.ZodObject<any> | null>();

    // const monaco = useMonaco();
    // const [completionProvider, setCompletionProvider] =
    //     useState<IDisposable | null>(null);
    // useEffect(() => {
    //     if (!monaco || !editorRef.current) {
    //         return;
    //     }
    //     if (completionProvider) {
    //         completionProvider.dispose();
    //     }

    //     const newProvider = monaco.languages.registerCompletionItemProvider(
    //         "graphql",
    //         {
    //             triggerCharacters: [":", "$", "\n", " ", "(", "@"],
    //             provideCompletionItems: async (model, position, context) => {
    //                 // const isUriEquals = model.uri.path === editorRef.current.path;
    //                 // if (!isUriEquals) {
    //                 //   return { suggestions: [] };
    //                 // }
    //                 languageService.updateSchema({
    //                     uri: model.uri.path,
    //                     schema,
    //                 });
    //                 const completionItems = languageService.getCompletion(
    //                     model.uri.path,
    //                     model.getValue(),
    //                     position as any
    //                 );

    //                 return {
    //                     incomplete: true,
    //                     suggestions: [
    //                         ...completionItems,
    //                         {
    //                             label: "String",
    //                             kind: 24,
    //                             insertText: "String",
    //                         },
    //                         {
    //                             label: "Int",
    //                             kind: 24,
    //                             insertText: "Int",
    //                         },
    //                     ],
    //                 };
    //             },
    //         }
    //     );
    //     setCompletionProvider(newProvider);
    // }, [monaco, editorRef.current, schema]);

    async function generateSchema(code: string) {
        // using callbacks instead of await due to rollup error
        codegen(code).then(result => {
            import(/* @vite-ignore */ result).then(validators => {
                const schemaName = `${name}StateSchema`;
                const validator = validators[schemaName];
                setValidationSchema(validator);
                onGenerate({ documentName: name, schema: code, validator });
            });
        });
    }

    useEffect(() => {
        if (!editorRef.current) {
            return;
        }

        editorRef.current.onDidBlurEditorText(() => {
            generateSchema(code);
        });
    }, [editorRef.current, code]);

    return (
        <div>
            <Editor
                theme={`vs-${props}`}
                onSchemaChange={schema => setSchema(schema)}
                width="100%"
                height="60vh"
                value={code}
                onChange={value => setCode(value ?? '')}
                {...props}
                onMount={(editor, monaco) => {
                    editorRef.current = editor;
                    props.onMount?.(editor, monaco);
                }}
                options={{
                    lineNumbers: 'off',
                    lineNumbersMinChars: 0,
                    minimap: { enabled: false },
                    automaticLayout: true,
                    ...props.options,
                }}
            />
        </div>
    );
}
