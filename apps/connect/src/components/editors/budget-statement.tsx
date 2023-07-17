import {
    BudgetStatementDocument,
    actions,
    utils,
} from '@acaldas/document-model-libs/browser/budget-statement';
import { BudgetStatement } from 'document-model-editors';
import { useAtomValue } from 'jotai';
import { useEffect } from 'react';
import { themeAtom } from '../../store';

interface IProps {
    initialBudget?: BudgetStatementDocument;
    onChange?: (budget: BudgetStatementDocument) => void;
}

export default function Editor({ initialBudget, onChange }: IProps) {
    const theme = useAtomValue(themeAtom);

    const [budgetStatement, dispatch, reset] =
        BudgetStatement.useBudgetStatementReducer(
            initialBudget ?? (utils.createBudgetStatement() as any) // TODO remove any
        );

    useEffect(() => {
        reset(initialBudget ?? utils.createBudgetStatement()) as any; // TODO remove any;
    }, [initialBudget]);

    useEffect(() => {
        onChange?.(budgetStatement);
    }, [budgetStatement]);

    const operations = budgetStatement
        ? [...budgetStatement.operations].reverse()
        : [];

    function undo() {
        dispatch(actions.undo());
    }

    function redo() {
        dispatch(actions.redo());
    }

    const canUndo = budgetStatement && budgetStatement.revision > 0;
    const canRedo =
        budgetStatement &&
        budgetStatement.revision < budgetStatement.operations.length;

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ width: '50%' }}>
                    <BudgetStatement.Editor
                        editorContext={{ theme }}
                        budgetStatement={budgetStatement}
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
                                        budgetStatement &&
                                        o.index < budgetStatement?.revision
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

export function createBudgetStatementEditor(props: IProps) {
    return () => <Editor {...props} />;
}
