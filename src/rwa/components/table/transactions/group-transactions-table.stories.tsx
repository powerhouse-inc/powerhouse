import { GroupTransaction } from '@/rwa';
import {
    mockCashAssets,
    mockFixedIncomes,
    mockPrincipalLenderAccountId,
    mockServiceProviderFeeTypes,
} from '@/rwa/mocks';
import { mockGroupTransactions } from '@/rwa/mocks/transactions';
import type { Meta, StoryObj } from '@storybook/react';
import { useCallback, useState } from 'react';
import { getColumnCount } from '../hooks/useColumnPriority';
import { GroupTransactionsTableProps } from '../types';
import { GroupTransactionsTable } from './group-transactions-table';

const meta: Meta<typeof GroupTransactionsTable> = {
    title: 'RWA/Components/Group Transactions Table',
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

export const Primary: Story = {
    args: {
        transactions: mockGroupTransactions,
        fixedIncomes: mockFixedIncomes,
        cashAssets: mockCashAssets,
        serviceProviderFeeTypes: mockServiceProviderFeeTypes,
        principalLenderAccountId: mockPrincipalLenderAccountId,
    },
    render: function Wrapper(args) {
        const [expandedRowId, setExpandedRowId] = useState<string>();
        const [selectedItem, setSelectedItem] = useState<GroupTransaction>();
        const [showNewItemForm, setShowNewItemForm] = useState(false);

        const toggleExpandedRow = useCallback((id: string | undefined) => {
            setExpandedRowId(curr => (id === curr ? undefined : id));
        }, []);

        const onSubmitEdit: GroupTransactionsTableProps['onSubmitEdit'] =
            useCallback(data => {
                console.log('edit', { data });
                setSelectedItem(undefined);
            }, []);

        const onSubmitCreate: GroupTransactionsTableProps['onSubmitCreate'] =
            useCallback(data => {
                console.log('create', { data });
                setShowNewItemForm(false);
            }, []);

        const argsWithHandlers: GroupTransactionsTableProps = {
            ...args,
            expandedRowId,
            selectedItem,
            toggleExpandedRow,
            setSelectedItem,
            showNewItemForm,
            setShowNewItemForm,
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
