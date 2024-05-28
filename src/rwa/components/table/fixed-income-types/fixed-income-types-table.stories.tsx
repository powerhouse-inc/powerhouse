import type { Meta, StoryObj } from '@storybook/react';
import { ComponentPropsWithoutRef, useCallback } from 'react';

import { mockFixedIncomeTypes, mockFixedIncomes } from '@/rwa/mocks';
import { mockStateInitial } from '@/rwa/mocks/state';
import { utils } from 'document-model/document';
import { getColumnCount } from '../hooks/useColumnPriority';
import { FixedIncomeTypeFormInputs } from '../types';
import { FixedIncomeTypesTable } from './fixed-income-types-table';

const meta: Meta<typeof FixedIncomeTypesTable> = {
    title: 'RWA/Components/Fixed Income Types Table',
    component: FixedIncomeTypesTable,
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

type FixedIncomeTypesTableWrapperProps = ComponentPropsWithoutRef<
    typeof FixedIncomeTypesTable
>;

export const Empty: Story = {
    args: {
        state: mockStateInitial,
    },
    render: function Wrapper(args) {
        function createFixedIncomeTypeFromFormInputs(
            data: FixedIncomeTypeFormInputs,
        ) {
            const id = utils.hashKey();

            return {
                ...data,
                id,
            };
        }

        const onSubmitEdit: FixedIncomeTypesTableWrapperProps['onSubmitEdit'] =
            useCallback(data => {
                const account = createFixedIncomeTypeFromFormInputs(data);
                console.log({ account, data });
            }, []);

        const onSubmitCreate: FixedIncomeTypesTableWrapperProps['onSubmitCreate'] =
            useCallback(data => {
                const account = createFixedIncomeTypeFromFormInputs(data);
                console.log({ account, data });
            }, []);

        const argsWithHandlers: FixedIncomeTypesTableWrapperProps = {
            ...args,
            onSubmitCreate,
            onSubmitEdit,
        };
        return (
            <div className="flex flex-col gap-4">
                <div className="w-screen">
                    <p>parent element width: 100%</p>
                    <FixedIncomeTypesTable {...argsWithHandlers} />
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
                            <FixedIncomeTypesTable {...argsWithHandlers} />
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
            fixedIncomeTypes: mockFixedIncomeTypes,
            portfolio: mockFixedIncomes,
        },
    },
};

export const WithDataAllowedToCreateDocuments: Story = {
    ...Empty,
    args: {
        ...WithDataReadOnly.args,
        isAllowedToCreateDocuments: true,
        isAllowedToEditDocuments: true,
    },
};
