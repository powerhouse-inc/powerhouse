import {
    manyMockGroupTransactions,
    mockFixedIncomes,
    mockGroupTransaction,
} from '@/rwa/mocks';
import { mockStateInitial, mockStateWithData } from '@/rwa/mocks/state';
import { useArgs } from '@storybook/preview-api';
import type { Meta, StoryObj } from '@storybook/react';
import { useCallback } from 'react';
import { useInterval } from 'usehooks-ts';
import { getColumnCount } from '../hooks/useColumnPriority';
import {
    GroupTransactionsTable,
    GroupTransactionsTableProps,
} from './group-transactions-table';

const meta: Meta<typeof GroupTransactionsTable> = {
    title: 'RWA/Components/Group Transactions Table',
    component: GroupTransactionsTable,
};

export default meta;
type Story = StoryObj<
    GroupTransactionsTableProps & {
        simulateBackgroundUpdates?: boolean;
    }
>;

const columnCountByTableWidth = {
    1520: 12,
    1394: 11,
    1239: 10,
    1112: 9,
    984: 8,
};

export const Empty: Story = {
    args: {
        state: mockStateInitial,
        simulateBackgroundUpdates: false,
    },
    render: function Wrapper(args) {
        const [, setArgs] = useArgs<typeof args>();
        useInterval(
            () => {
                setArgs({
                    ...args,
                    state: {
                        ...args.state,
                        transactions: [
                            ...args.state.transactions,
                            {
                                ...mockGroupTransaction,
                                id: `new-${Date.now()}`,
                            },
                        ],
                    },
                });
            },
            args.simulateBackgroundUpdates ? 3000 : null,
        );

        const onSubmitEdit: GroupTransactionsTableProps['onSubmitEdit'] =
            useCallback(data => {
                console.log('edit', { data });
            }, []);

        const onSubmitCreate: GroupTransactionsTableProps['onSubmitCreate'] =
            useCallback(data => {
                console.log('create', { data });
            }, []);

        const onSubmitDelete: GroupTransactionsTableProps['onSubmitDelete'] =
            useCallback(id => {
                console.log('delete', { id });
            }, []);

        const onSubmitCreateAsset: GroupTransactionsTableProps['onSubmitCreateAsset'] =
            useCallback(data => {
                console.log('create asset', { data });
            }, []);

        const onSubmitCreateServiceProviderFeeType: GroupTransactionsTableProps['onSubmitCreateServiceProviderFeeType'] =
            useCallback(data => {
                console.log('create asset', { data });
            }, []);

        const argsWithHandlers: GroupTransactionsTableProps = {
            ...args,
            onSubmitEdit,
            onSubmitCreate,
            onSubmitDelete,
            onSubmitCreateAsset,
            onSubmitCreateServiceProviderFeeType,
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

export const EmptyIsAllowedToCreateDocuments: Story = {
    ...Empty,
    args: {
        ...Empty.args,
        isAllowedToCreateDocuments: true,
        isAllowedToEditDocuments: true,
    },
};

export const WithDataReadyOnly: Story = {
    ...Empty,
    args: {
        ...Empty.args,
        state: mockStateWithData,
    },
};

export const WithDataIsAllowedToCreateDocuments: Story = {
    ...WithDataReadyOnly,
    args: {
        ...WithDataReadyOnly.args,
        isAllowedToCreateDocuments: true,
        isAllowedToEditDocuments: true,
    },
};

export const WithManyItems: Story = {
    ...WithDataIsAllowedToCreateDocuments,
    args: {
        ...WithDataIsAllowedToCreateDocuments.args,
        state: {
            ...mockStateWithData,
            transactions: manyMockGroupTransactions,
            portfolio: [
                ...mockFixedIncomes,
                ...Array.from({ length: 100 }, (_, i) => ({
                    ...mockFixedIncomes[0],
                    id: `fixed-income-${i + 1}`,
                })),
            ],
        },
    },
};
