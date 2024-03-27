import type { Meta, StoryObj } from '@storybook/react';
import { ComponentPropsWithoutRef, useCallback, useState } from 'react';

import { FixedIncomeType } from '@/rwa';
import { mockFixedIncomeTypes } from '@/rwa/mocks';
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

type FixedIncomeTypesTableProps = ComponentPropsWithoutRef<
    typeof FixedIncomeTypesTable
>;

export const Primary: Story = {
    args: {
        fixedIncomeTypes: mockFixedIncomeTypes,
    },
    render: function Wrapper(args) {
        const [expandedRowId, setExpandedRowId] = useState<string>();
        const [selectedItem, setSelectedItem] = useState<FixedIncomeType>();
        const [showNewItemForm, setShowNewItemForm] = useState(false);

        const toggleExpandedRow = useCallback(
            (id: string | undefined) => {
                setExpandedRowId(id === expandedRowId ? undefined : id);
            },
            [expandedRowId],
        );

        function createFixedIncomeTypeFromFormInputs(
            data: FixedIncomeTypeFormInputs,
        ) {
            const id = utils.hashKey();

            return {
                ...data,
                id,
            };
        }

        const onSubmitEdit: FixedIncomeTypesTableProps['onSubmitEdit'] =
            useCallback(data => {
                const account = createFixedIncomeTypeFromFormInputs(data);
                console.log({ account, data });
                setSelectedItem(undefined);
            }, []);

        const onSubmitCreate: FixedIncomeTypesTableProps['onSubmitCreate'] =
            useCallback(data => {
                const account = createFixedIncomeTypeFromFormInputs(data);
                console.log({ account, data });
                setShowNewItemForm(false);
            }, []);

        const argsWithHandlers: FixedIncomeTypesTableProps = {
            ...args,
            expandedRowId,
            selectedItem,
            showNewItemForm,
            setShowNewItemForm,
            toggleExpandedRow,
            setSelectedItem,
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
