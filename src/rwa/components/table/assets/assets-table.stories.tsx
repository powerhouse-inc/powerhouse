import { FixedIncome } from '@/rwa';
import type { Meta, StoryObj } from '@storybook/react';
import { utils } from 'document-model/document';
import { ComponentPropsWithoutRef, useCallback, useState } from 'react';

import { mockFixedIncomes, mockFixedIncomeTypes, mockSPVs } from '@/rwa/mocks';
import { getColumnCount } from '../hooks/useColumnPriority';
import { AssetFormInputs } from '../types';
import { AssetsTable } from './assets-table';

const meta: Meta<typeof AssetsTable> = {
    title: 'RWA/Components/Assets Table',
    component: AssetsTable,
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

type FixedIncomesTableProps = ComponentPropsWithoutRef<typeof AssetsTable>;

function createAssetFromFormInputs(data: AssetFormInputs) {
    const id = utils.hashKey();
    const maturity = data.maturity.toString();

    return {
        ...data,
        id,
        maturity,
    };
}

export const Primary: Story = {
    args: {
        assets: mockFixedIncomes,
        fixedIncomeTypes: mockFixedIncomeTypes,
        spvs: mockSPVs,
    },
    render: function Wrapper(args) {
        const [expandedRowId, setExpandedRowId] = useState<string>();
        const [selectedItem, setSelectedItem] = useState<FixedIncome>();
        const [showNewItemForm, setShowNewItemForm] = useState(false);

        const toggleExpandedRow = useCallback(
            (id: string | undefined) => {
                setExpandedRowId(id === expandedRowId ? undefined : id);
            },
            [expandedRowId],
        );

        const onSubmitEdit: FixedIncomesTableProps['onSubmitEdit'] =
            useCallback(data => {
                const asset = createAssetFromFormInputs(data);
                console.log({ asset, data });
                setSelectedItem(undefined);
            }, []);

        const onSubmitCreate: FixedIncomesTableProps['onSubmitCreate'] =
            useCallback(data => {
                const asset = createAssetFromFormInputs(data);
                console.log({ asset, data });
                setShowNewItemForm(false);
            }, []);

        const argsWithHandlers: FixedIncomesTableProps = {
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
                    <AssetsTable {...argsWithHandlers} />
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
                            <AssetsTable {...argsWithHandlers} />
                        </div>
                    ))}
            </div>
        );
    },
};
