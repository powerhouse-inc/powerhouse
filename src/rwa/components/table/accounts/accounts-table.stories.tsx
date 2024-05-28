import type { Meta, StoryObj } from '@storybook/react';
import { useCallback } from 'react';

import {
    mockAccounts,
    mockGroupTransactions,
    mockServiceProviderFeeTypes,
} from '@/rwa/mocks';
import { mockStateInitial } from '@/rwa/mocks/state';
import { utils } from 'document-model/document';
import { getColumnCount } from '../hooks/useColumnPriority';
import { AccountFormInputs } from '../types';
import { AccountsTable, AccountsTableProps } from './accounts-table';

const meta: Meta<typeof AccountsTable> = {
    title: 'RWA/Components/Accounts Table',
    component: AccountsTable,
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

export const Empty: Story = {
    args: {
        state: mockStateInitial,
    },
    render: function Wrapper(args) {
        function createAccountFromFormInputs(data: AccountFormInputs) {
            const id = utils.hashKey();

            return {
                ...data,
                id,
            };
        }

        const onSubmitEdit: AccountsTableProps['onSubmitEdit'] = useCallback(
            data => {
                const account = createAccountFromFormInputs(data);
                console.log({ account, data });
            },
            [],
        );

        const onSubmitCreate: AccountsTableProps['onSubmitCreate'] =
            useCallback(data => {
                const account = createAccountFromFormInputs(data);
                console.log({ account, data });
            }, []);

        const argsWithHandlers: AccountsTableProps = {
            ...args,
            onSubmitCreate,
            onSubmitEdit,
        };
        return (
            <div className="flex flex-col gap-4">
                <div className="w-screen">
                    <p>parent element width: 100%</p>
                    <AccountsTable {...argsWithHandlers} />
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
                            <AccountsTable {...argsWithHandlers} />
                        </div>
                    ))}
            </div>
        );
    },
};

export const WithDataReadOnly: Story = {
    ...Empty,
    args: {
        ...Empty.args,
        state: {
            ...mockStateInitial,
            accounts: mockAccounts,
            serviceProviderFeeTypes: mockServiceProviderFeeTypes,
            transactions: mockGroupTransactions,
        },
    },
};

export const WithDataIsAllowedToCreateDocuments: Story = {
    ...WithDataReadOnly,
    args: {
        ...WithDataReadOnly.args,
        isAllowedToCreateDocuments: true,
        isAllowedToEditDocuments: true,
    },
};
