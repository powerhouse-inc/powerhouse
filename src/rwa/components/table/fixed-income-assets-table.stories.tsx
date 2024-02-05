import type { Meta, StoryObj } from '@storybook/react';
import { mockFixedIncomeAssetsTableData } from './fixed-income-assets-mock-table-data';
import {
    FixedIncomeAssetsTable,
    columnCountByTableWidth,
} from './fixed-income-assets-table';
import { getColumnCount } from './useColumnPriority';

const meta: Meta<typeof FixedIncomeAssetsTable> = {
    title: 'RWA/Components/FixedIncomeAssetsTable',
    component: FixedIncomeAssetsTable,
    argTypes: {
        items: { control: 'object' },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
    args: {
        items: mockFixedIncomeAssetsTableData,
    },
    render: args => (
        <div className="flex flex-col gap-4">
            <div className="w-screen">
                <p>parent element width: 100%</p>
                <FixedIncomeAssetsTable {...args} />
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
                        <FixedIncomeAssetsTable {...args} />
                    </div>
                ))}
        </div>
    ),
};
