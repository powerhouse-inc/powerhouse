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
        ScopeFramework.useScopeFrameworkReducer();

    useEffect(() => {
        reset(
            initialScopeFramework ?? createEmptyExtendedScopeFrameworkState()
        ) as any; // TODO remove any;
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
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ width: '50%' }}>
                    <ScopeFramework.Editor
                        editorContext={{ theme }}
                        scopeFramework={scopeFramework}
                        dispatch={dispatch}
                    />
                </div>
                <div style={{ width: '40%' }}>
                    <h3>
                        Operations&emsp;
                        <button disabled={!canUndo} onClick={undo}>
                            Undo
                        </button>
                        &ensp;
                        <button disabled={!canRedo} onClick={redo}>
                            Redo
                        </button>
                    </h3>
                    <div></div>
                    <ul>
                        {operations.map(o => (
                            <li
                                key={o.index}
                                style={{
                                    opacity:
                                        scopeFramework &&
                                        o.index < scopeFramework?.revision
                                            ? 1
                                            : 0.5,
                                }}
                            >
                                <b>{`${o.index + 1} - ${o.type}`}</b>
                                <br />
                                <pre style={{ overflow: 'auto' }}>
                                    {JSON.stringify(o.input, null, 2)}
                                </pre>
                                <hr />
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
}

export function createScopeFrameworkEditor(props: IProps) {
    return () => <Editor {...props} />;
}
