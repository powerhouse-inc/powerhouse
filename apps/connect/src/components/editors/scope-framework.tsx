import {
    ExtendedScopeFrameworkState,
    actions,
    createEmptyExtendedScopeFrameworkState,
} from '@acaldas/document-model-libs/browser/scope-framework';
import { ScopeFramework } from 'document-model-editors';
import { useAtomValue } from 'jotai';
import { useEffect } from 'react';
import { themeAtom } from '../../store';

interface IProps {
    initialScopeFramework?: ExtendedScopeFrameworkState;
    onChange?: (budget: ExtendedScopeFrameworkState) => void;
}

export default function Editor({ initialScopeFramework, onChange }: IProps) {
    const theme = useAtomValue(themeAtom);

    const [scopeFramework, dispatch, reset] =
        ScopeFramework.useScopeFrameworkReducer(initialScopeFramework);

    useEffect(() => {
        reset(
            initialScopeFramework ?? createEmptyExtendedScopeFrameworkState()
        );
    }, [initialScopeFramework]);

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

export function createScopeFrameworkEditor(props: IProps) {
    return () => <Editor {...props} />;
}
