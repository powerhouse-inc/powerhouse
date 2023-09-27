import { Editor as CodeEditor, EditorProps } from '@monaco-editor/react';
import { editor } from 'monaco-editor';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { ColorTheme } from '../common/styles';

interface IProps extends EditorProps {
    validator?: () => z.ZodObject<any>;
    onCreate: (create: string) => void;
    theme: ColorTheme;
}

export default function EditorInitialState({
    validator,
    onCreate,
    theme,
    ...props
}: IProps) {
    const [code, setCode] = useState(`{}`);

    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
    useEffect(() => {
        if (!editorRef.current) {
            return;
        }

        editorRef.current.onDidBlurEditorText(() => {
            onCreate(code);
        });
    }, [editorRef.current, code]);

    // useEffect(() => {
    //     setTimeout(() => {
    //         editorRef.current?.setPosition({ lineNumber: 11, column: 9 });
    //         editorRef.current?.focus();
    //     });
    // }, []);

    let errorMessage = '';
    let valid = false;
    try {
        const initialState = JSON.parse(code);
        if (validator) {
            valid = validator().strict().safeParse(initialState).success;
            if (!valid) {
                errorMessage = 'Invalid initial state';
            }
        }
    } catch (error) {
        errorMessage = 'Invalid JSON';
    }

    return (
        <div>
            <CodeEditor
                theme={`vs-${theme}`}
                width="100%"
                height="60vh"
                language="json"
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
            <p style={{ marginTop: 10, fontSize: '1.1rem', color: 'red' }}>
                {errorMessage}
            </p>
        </div>
    );
}
