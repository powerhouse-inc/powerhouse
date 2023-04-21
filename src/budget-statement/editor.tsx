import React, { useCallback, useEffect, useState } from "react";
import {
    BudgetStatementDocument,
    actions,
    reducer,
    utils,
} from "document-model-libs/browser/budget-statement";
import { BudgetStatement } from "document-model-editors";

export default function Editor() {
    const [initialBudgetStatement, setInitialBudgetStatement] =
        useState<BudgetStatementDocument>(utils.createBudgetStatement());
    const [budgetStatement, setBudgetStatement] =
        useState<BudgetStatementDocument>();

    useEffect(() => {
        setBudgetStatement(initialBudgetStatement);
    }, [initialBudgetStatement]);

    async function loadNode() {
        // @ts-ignore
        const budgetStatement = await window.electronAPI.openFile();
        setInitialBudgetStatement(budgetStatement);
    }

    async function saveNode() {
        // @ts-ignore
        await window.electronAPI.saveFile(budgetStatement);
    }

    async function loadBrowser() {
        // open file picker, destructure the one element returned array
        const [fileHandle] = await window.showOpenFilePicker();
        const file = await fileHandle.getFile();

        const budgetStatement = await utils.loadBudgetStatementFromInput(file);
        setInitialBudgetStatement(budgetStatement);
    }

    async function saveBrowser() {
        if (!budgetStatement) {
            return;
        }
        // @ts-ignore
        const file = await window.showSaveFilePicker({
            suggestedName: `${
                budgetStatement?.data.month ?? "budget"
            }.phbs.zip`,
        });

        utils.saveBudgetStatementToFileHandle(budgetStatement, file);
    }

    const onChange = useCallback((budgetStatement: BudgetStatementDocument) => {
        setBudgetStatement({ ...budgetStatement });
    }, []);

    const newDocument = () => {
        setInitialBudgetStatement(utils.createBudgetStatement());
    };

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
            <div>
                <button onClick={newDocument}>New document</button>&ensp;
                {
                    // @ts-ignore
                    window.electronAPI ? (
                        <>
                            <button onClick={loadNode}>Load document</button>
                            &ensp;
                            <button onClick={saveNode}>Save document</button>
                        </>
                    ) : (
                        <>
                            <button onClick={loadBrowser}>Load document</button>
                            &ensp;
                            <button onClick={saveBrowser}>Save document</button>
                        </>
                    )
                }
                <div
                    style={{ display: "flex", justifyContent: "space-between" }}
                >
                    <div style={{ width: "50%" }}>
                        <BudgetStatement.Editor
                            budgetStatement={initialBudgetStatement}
                            onChange={onChange}
                        />
                    </div>
                    <div style={{ width: "40%" }}>
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
                            {operations.map((o) => (
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
                                    <pre style={{ overflow: "auto" }}>
                                        {JSON.stringify(o.input, null, 2)}
                                    </pre>
                                    <hr />
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
}
