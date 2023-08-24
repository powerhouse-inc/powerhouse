import {
    ScopeFrameworkAction,
    ScopeFrameworkState,
    actions,
    reducer,
    utils,
} from '@acaldas/document-model-libs/browser/scope-framework';
import ScopeFramework from 'document-model-editors/scope-framework';
import { useAtomValue } from 'jotai';
import { useEffect } from 'react';
import { themeAtom } from 'src/store';
import { useDocumentReducer } from 'src/utils/document-model';
import { EditorProps } from '.';

export default function Editor({
    document,
    onChange,
}: EditorProps<ScopeFrameworkState, ScopeFrameworkAction>) {
    const theme = useAtomValue(themeAtom);
    const [scopeFramework, dispatch] = useDocumentReducer(
        reducer,
        utils.createDocument(document)
    );

    useEffect(() => {
        onChange?.(scopeFramework);
    }, [scopeFramework]);

    const operations = scopeFramework
        ? [...scopeFramework.operations].reverse()
        : [];

    function undo() {
        dispatch(actions.undo());
    }

    function redo() {
        dispatch(actions.redo());
    }

    const canUndo = scopeFramework && scopeFramework.revision > 0;
    const canRedo =
        scopeFramework &&
        scopeFramework.revision < scopeFramework.operations.length;

    return (
        <div className="relative h-full">
            <ScopeFramework.Component
                editorContext={{ theme }}
                document={scopeFramework}
                dispatch={dispatch}
            />
        </div>
    );
}
