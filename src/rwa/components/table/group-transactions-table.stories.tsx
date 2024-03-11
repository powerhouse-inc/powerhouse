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
import { Fields, GroupTransactionsTable } from './group-transactions-table';
import { getColumnCount } from './useColumnPriority';

const meta: Meta<typeof GroupTransactionsTable> = {
    title: 'RWA/Components/GroupTransactionsTable',
    component: GroupTransactionsTable,
};

export default meta;
type Story = StoryObj<typeof meta>;

const columnCountByTableWidth = {
    1520: 12,
    1394: 11,
    1239: 10,
    1112: 9,
    984: 8,
};

const fieldsPriority: (keyof Fields)[] = [
    'Entry time',
    'Asset',
    'Quantity',
    'Cash Amount',
    'Cash Balance Change',
];

export const Primary: Story = {
    args: {
        items: mockGroupTransactions,
        fixedIncomes: mockFixedIncomes,
        cashAssets: mockCashAssets,
        serviceProviderFeeTypes: mockServiceProviderFeeTypes,
        principalLenderAccountId: mockPrincipalLenderAccountId,
        fieldsPriority,
        columnCountByTableWidth,
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
                {Object.keys(columnCountByTableWidth)
                    .map(Number)
                    .map(width => width + 50)
                    .map(width => (
                        <div key={width} style={{ width: `${width}px` }}>
                            <p>parent element width: {width}px</p>
                            <p>
                                column count:{' '}
                                {getColumnCount(width, columnCountByTableWidth)}
                            </p>
                            <GroupTransactionsTable {...argsWithHandlers} />
                        </div>
                    ))}
            </div>
        );
    },
};
