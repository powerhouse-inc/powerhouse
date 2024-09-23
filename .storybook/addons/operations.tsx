/* eslint-disable react-hooks/rules-of-hooks */
import { AddonPanel } from '@storybook/components';
import { addons, types } from '@storybook/manager-api';
import { Document } from 'document-model';
import React from 'react';

const ADDON_ID = 'Operations';
const PANEL_ID = `${ADDON_ID}/panel`;

const OperationsPanel = (
    { operations }: { readonly operations: Document.Document['operations'] }, // TODO export
) => {
    const operationsByTime = operations.global
        .concat(operations.local)
        .sort(
            (op1, op2) =>
                new Date(op1.timestamp).getTime() -
                new Date(op2.timestamp).getTime(),
        );
    return (
        <table
            style={{
                width: '100%',
                textAlign: 'left',
            }}
        >
            <thead>
                <tr>
                    <th>Type</th>
                    <th>Input</th>
                    <th>Index</th>
                    <th>Timestamp</th>
                    <th>Hash</th>
                    <th>Scope</th>
                    <th>Context</th>
                </tr>
            </thead>
            <tbody>
                {operationsByTime.map((op) => (
                    <tr key={op.index}>
                        <td>{op.type}</td>
                        <td>
                            <pre
                                style={{
                                    margin: '0 10px',
                                    padding: 0,
                                    maxHeight: 200,
                                    overflow: 'auto',
                                    background: 'rgba(100,100,100,0.2)',
                                }}
                            >
                                {JSON.stringify(op.input, null, 2)}
                            </pre>
                        </td>
                        <td>{op.index}</td>
                        <td>{new Date(op.timestamp).toISOString()}</td>
                        <td>{op.hash}</td>
                        <td>{op.scope}</td>
                        <td>
                            <pre
                                style={{
                                    margin: '0 10px',
                                    padding: 0,
                                    maxHeight: 200,
                                    overflow: 'auto',
                                    background: 'rgba(100,100,100,0.2)',
                                }}
                            >
                                {JSON.stringify(op.context, null, 2)}
                            </pre>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
};

addons.register(ADDON_ID, (api) => {
    const channel = api.getChannel();
    addons.add(PANEL_ID, {
        type: types.PANEL,
        title: 'Operations',
        render: ({ active }) => {
            const [budgetStatement, setBudgetStatement] =
                React.useState<Document.Document>();
            React.useEffect(() => {
                channel?.addListener('DOCUMENT', setBudgetStatement);
                return () =>
                    channel?.removeListener('DOCUMENT', setBudgetStatement);
            }, [channel]);

            return (
                <AddonPanel active={active ?? false}>
                    {budgetStatement ? (
                        <OperationsPanel
                            operations={budgetStatement.operations}
                        />
                    ) : null}
                </AddonPanel>
            );
        },
    });
});
