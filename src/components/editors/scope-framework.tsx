import {
    ExtendedScopeFrameworkState,
    actions,
} from '@acaldas/document-model-libs/browser/scope-framework';
import { ScopeFramework } from 'document-model-editors';
import { useAtomValue } from 'jotai';
import { useEffect } from 'react';
import { themeAtom } from 'src/store';
import { EditorProps } from '.';

export default function Editor({ document, onChange }: EditorProps) {
    const theme = useAtomValue(themeAtom);
    const [scopeFramework, dispatch] = ScopeFramework.useScopeFrameworkReducer(
        document as ExtendedScopeFrameworkState
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
            <ScopeFramework.Editor
                editorContext={{ theme }}
                scopeFramework={scopeFramework}
                dispatch={dispatch}
            />
        </div>
    );
}
