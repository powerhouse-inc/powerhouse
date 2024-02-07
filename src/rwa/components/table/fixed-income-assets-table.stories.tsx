import type { Meta, StoryObj } from '@storybook/react';
import { mockFixedIncomeAssetsTableData } from './fixed-income-assets-mock-table-data';
import {
    RWAFixedIncomeAssetsTable,
    columnCountByTableWidth,
} from './fixed-income-assets-table';
import { getColumnCount } from './useColumnPriority';

const meta: Meta<typeof RWAFixedIncomeAssetsTable> = {
    title: 'RWA/Components/RWAFixedIncomeAssetsTable',
    component: RWAFixedIncomeAssetsTable,
    argTypes: {
        items: { control: 'object' },
        onCancelEdit: { action: 'onCancelEdit' },
        onClickDetails: { action: 'onClickDetails' },
        onEditItem: { action: 'onEditItem' },
        onSubmitEdit: { action: 'onSubmitEdit' },
        expandedRowId: { control: 'text' },
        editRowId: { control: 'text' },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
    args: {
        items: mockFixedIncomeAssetsTableData,
        assetTypeOptions: [
            { id: '91279GF8', label: 'T-Bill 91279GF8' },
            { id: '91279GF9', label: 'T-Bill 91279GF9' },
        ],
        maturityOptions: [
            { id: 'purchase', label: 'Purchase' },
            { id: 'mature', label: 'Mature' },
        ],
    },
    render: args => (
        <div className="flex flex-col gap-4">
            <div className="w-screen">
                <p>parent element width: 100%</p>
                <RWAFixedIncomeAssetsTable {...args} />
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
                        <RWAFixedIncomeAssetsTable {...args} />
                    </div>
                ))}
        </div>
    ),
};
