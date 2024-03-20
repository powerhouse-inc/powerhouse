import { GroupTransaction, GroupTransactionsTableProps } from '@/rwa';
import {
    mockCashAssets,
    mockFixedIncomes,
    mockPrincipalLenderAccountId,
    mockServiceProviderFeeTypes,
} from '@/rwa/mocks';
import { mockGroupTransactions } from '@/rwa/mocks/transactions';
import type { Meta, StoryObj } from '@storybook/react';
import { useCallback, useState } from 'react';
import {
    GroupTransactionsTable,
    groupTransactionsColumnCountByTableWidth,
} from './group-transactions-table';
import { getColumnCount } from './useColumnPriority';

const meta: Meta<typeof GroupTransactionsTable> = {
    title: 'RWA/Components/Group Transactions Table',
    component: GroupTransactionsTable,
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
    args: {
        items: mockGroupTransactions,
        fixedIncomes: mockFixedIncomes,
        cashAssets: mockCashAssets,
        serviceProviderFeeTypes: mockServiceProviderFeeTypes,
        principalLenderAccountId: mockPrincipalLenderAccountId,
    },
    render: function Wrapper(args) {
        const [expandedRowId, setExpandedRowId] = useState<string>();
        const [
            selectedGroupTransactionToEdit,
            setSelectedGroupTransactionToEdit,
        ] = useState<GroupTransaction>();
        const [showNewGroupTransactionForm, setShowNewGroupTransactionForm] =
            useState(false);

        const toggleExpandedRow = useCallback((id: string) => {
            setExpandedRowId(curr => (id === curr ? undefined : id));
        }, []);

        const onClickDetails: GroupTransactionsTableProps['onClickDetails'] =
            useCallback(() => {}, []);

        const onCancelEdit: GroupTransactionsTableProps['onCancelEdit'] =
            useCallback(() => {
                setSelectedGroupTransactionToEdit(undefined);
            }, []);

        const onSubmitEdit: GroupTransactionsTableProps['onSubmitEdit'] =
            useCallback(data => {
                console.log('edit', { data });
                setSelectedGroupTransactionToEdit(undefined);
            }, []);

        const onSubmitCreate: GroupTransactionsTableProps['onSubmitCreate'] =
            useCallback(data => {
                console.log('create', { data });
                setShowNewGroupTransactionForm(false);
            }, []);

        const argsWithHandlers = {
            ...args,
            expandedRowId,
            selectedGroupTransactionToEdit,
            toggleExpandedRow,
            onClickDetails,
            setSelectedGroupTransactionToEdit,
            showNewGroupTransactionForm,
            setShowNewGroupTransactionForm,
            onCancelEdit,
            onSubmitEdit,
            onSubmitCreate,
        };
        return (
            <div className="flex flex-col gap-4">
                <div className="w-screen">
                    <p>parent element width: 100%</p>
                    <GroupTransactionsTable {...argsWithHandlers} />
                </div>
                {Object.keys(groupTransactionsColumnCountByTableWidth)
                    .map(Number)
                    .map(width => width + 50)
                    .map(width => (
                        <div key={width} style={{ width: `${width}px` }}>
                            <p>parent element width: {width}px</p>
                            <p>
                                column count:{' '}
                                {getColumnCount(
                                    width,
                                    groupTransactionsColumnCountByTableWidth,
                                )}
                            </p>
                            <GroupTransactionsTable {...argsWithHandlers} />
                        </div>
                    ))}
            </div>
        );
    },
};
