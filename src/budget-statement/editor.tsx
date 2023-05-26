import {
    BudgetStatementDocument,
    actions,
    reducer,
    utils,
} from '@acaldas/document-model-libs/browser/budget-statement';
import { BudgetStatement } from 'document-model-editors';
import { useCallback, useEffect, useState } from 'react';

interface IProps {
    initialBudget?: BudgetStatementDocument;
    onChange?: (budget: BudgetStatementDocument) => void;
}

export default function Editor({ initialBudget, onChange }: IProps) {
    const [initialBudgetStatement, setInitialBudgetStatement] =
        useState<BudgetStatementDocument>(
            initialBudget ?? utils.createBudgetStatement()
        );
    const [budgetStatement, setBudgetStatement] =
        useState<BudgetStatementDocument>();

    useEffect(() => {
        setBudgetStatement(initialBudgetStatement);
    }, [initialBudgetStatement]);

    const handleChange = useCallback(
        (budgetStatement: BudgetStatementDocument) => {
            setBudgetStatement({ ...budgetStatement });
            onChange?.(budgetStatement);
        },
        []
    );

    const operations = budgetStatement
        ? [...budgetStatement.operations].reverse()
        : [];

    function undo() {
        if (!budgetStatement) {
            return;
        }
        const newBudget = reducer(budgetStatement, actions.undo());
        setInitialBudgetStatement(newBudget);
    }

    function redo() {
        if (!budgetStatement) {
            return;
        }
        const newBudget = reducer(budgetStatement, actions.redo());
        setInitialBudgetStatement(newBudget);
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
                        budgetStatement={initialBudgetStatement}
                        onChange={handleChange}
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
