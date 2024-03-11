import { FixedIncome } from '@/rwa';
import type { Meta, StoryObj } from '@storybook/react';
import { utils } from 'document-model/document';
import { useCallback, useState } from 'react';
import { RWAAssetDetailInputs } from '../asset-details/form';

import { mockFixedIncomes, mockFixedIncomeTypes, mockSpvs } from '@/rwa/mocks';
import {
    FixedIncomesTableProps,
    RWAFixedIncomesTable,
} from './fixed-income-assets-table';
import { getColumnCount } from './useColumnPriority';

const meta: Meta<typeof RWAFixedIncomesTable> = {
    title: 'RWA/Components/RWAFixedIncomesTable',
    component: RWAFixedIncomesTable,
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

const fieldsPriority: (keyof FixedIncome)[] = [
    'name',
    'maturity',
    'notional',
    'coupon',
    'purchasePrice',
    'purchaseDate',
    'totalDiscount',
    'purchaseProceeds',
];

function createAssetFromFormInputs(data: RWAAssetDetailInputs) {
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
        items: mockFixedIncomes,
        fixedIncomeTypes: mockFixedIncomeTypes,
        spvs: mockSpvs,
        fieldsPriority,
        columnCountByTableWidth,
    },
    render: function Wrapper(args) {
        const [expandedRowId, setExpandedRowId] = useState<string>();
        const [selectedAssetToEdit, setSelectedAssetToEdit] =
            useState<FixedIncome>();
        const [showNewAssetForm, setShowNewAssetForm] = useState(false);

        const toggleExpandedRow = useCallback(
            (id: string) => {
                setExpandedRowId(id === expandedRowId ? undefined : id);
            },
            [expandedRowId],
        );

        const onClickDetails: FixedIncomesTableProps['onClickDetails'] =
            useCallback(
                item => {
                    setExpandedRowId(
                        item.id === expandedRowId
                            ? undefined
                            : item.id || undefined,
                    );
                },
                [expandedRowId],
            );

        const onCancelEdit: FixedIncomesTableProps['onCancelEdit'] =
            useCallback(() => {
                setSelectedAssetToEdit(undefined);
            }, []);

        const onSubmitEdit: FixedIncomesTableProps['onSubmitEdit'] =
            useCallback(data => {
                const asset = createAssetFromFormInputs(data);
                console.log({ asset, data });
                setSelectedAssetToEdit(undefined);
            }, []);

        const onSubmitCreate: FixedIncomesTableProps['onSubmitCreate'] =
            useCallback(data => {
                const asset = createAssetFromFormInputs(data);
                console.log({ asset, data });
                setShowNewAssetForm(false);
            }, []);

        const argsWithHandlers = {
            ...args,
            expandedRowId,
            selectedAssetToEdit,
            showNewAssetForm,
            setShowNewAssetForm,
            toggleExpandedRow,
            onClickDetails,
            setSelectedAssetToEdit,
            onCancelEdit,
            onSubmitCreate,
            onSubmitEdit,
        };
        return (
            <div className="flex flex-col gap-4">
                <div className="w-screen">
                    <p>parent element width: 100%</p>
                    <RWAFixedIncomesTable {...argsWithHandlers} />
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
                            <RWAFixedIncomesTable {...argsWithHandlers} />
                        </div>
                    ))}
            </div>
        );
    },
};
