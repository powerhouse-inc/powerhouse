import { Icon } from '@/powerhouse';
import { FixedIncomeAsset } from '@/rwa';
import { action } from '@storybook/addon-actions';
import type { Meta, StoryObj } from '@storybook/react';
import { orderBy } from 'natural-orderby';
import { useState } from 'react';
import { twMerge } from 'tailwind-merge';
import { RWAAssetDetails } from '../asset-details';
import { RWATableRow } from './expandable-row';
import {
    mockFixedIncomeAssetsTableData,
    mockFixedIncomeTypes,
    mockSpvs,
} from './fixed-income-assets-mock-table-data';
import { RWATable, RWATableProps } from './table';
import { RWATableCell } from './table-cell';

const meta: Meta<typeof RWATable<FixedIncomeAsset>> = {
    title: 'RWA/Components/RWATable',
    component: RWATable,
    argTypes: {
        header: { control: 'object' },
        items: { control: 'object' },
        renderRow: { control: 'function' },
        onClickSort: { control: 'action' },
        footer: { control: 'object' },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
    args: {
        header: [
            { id: 'id', label: '#', allowSorting: true },
            { id: 'relatedSpv', label: 'Related SPV', allowSorting: true },
            { id: 'assetId', label: 'Asset ID', allowSorting: true },
            { id: 'assetName', label: 'Asset Name', allowSorting: true },
            { id: 'coupon', label: 'Coupon', allowSorting: true },
            { id: 'maturity', label: 'Maturity', allowSorting: true },
            { id: 'notional', label: 'Notional', allowSorting: true },
            { id: 'moreDetails' },
        ],
        items: mockFixedIncomeAssetsTableData,
        renderRow: (item, index) => (
            <tr
                key={item.id}
                className={twMerge(
                    '[&>td:not(:first-child)]:border-l [&>td:not(:first-child)]:border-gray-300',
                    index % 2 !== 0 && 'bg-gray-50',
                )}
            >
                <RWATableCell>{item.id}</RWATableCell>
                <RWATableCell>{item.coupon}</RWATableCell>
                <RWATableCell>{item.maturity}</RWATableCell>
                <RWATableCell>{item.notional}</RWATableCell>
                <RWATableCell>
                    <button onClick={() => action('onClickDetails')(item)}>
                        <Icon name="arrow-filled-right" size={12} />
                    </button>
                </RWATableCell>
            </tr>
        ),
        footer: <div className="p-2 text-center">Table footer</div>,
    },
    render: args => <TableDemo {...args} />,
};

const TableDemo = (props: RWATableProps<FixedIncomeAsset>) => {
    const { items, ...restProps } = props;

    const [sortedItems, setSortedItems] = useState(items || []);
    const [expandedRow, setExpandedRow] = useState<string | null>(null);
    const [editRow, setEditRow] = useState<string | null>(null);

    const toggleRow = (id: string) => {
        setExpandedRow(id === expandedRow ? null : id);
    };

    const onClickSort: RWATableProps<FixedIncomeAsset>['onClickSort'] = (
        column,
        direction,
    ) => {
        console.log('onClickSort', column, direction);
        setSortedItems(
            orderBy(
                sortedItems,
                [column as keyof FixedIncomeAsset],
                [direction],
            ),
        );
    };

    const renderRow: RWATableProps<FixedIncomeAsset>['renderRow'] = (
        item,
        index,
    ) => {
        return (
            <RWATableRow
                isExpanded={expandedRow === item.id}
                tdProps={{ colSpan: 8 }}
                accordionContent={
                    <RWAAssetDetails
                        asset={item}
                        fixedIncomeTypes={mockFixedIncomeTypes}
                        spvs={mockSpvs}
                        className="border-y border-gray-300"
                        mode={editRow === item.id ? 'edit' : 'view'}
                        onCancel={() => setEditRow(null)}
                        selectItemToEdit={() => setEditRow(item.id)}
                        onSubmitForm={data => {
                            action('onSubmitForm')(data);
                            setEditRow(null);
                        }}
                    />
                }
                key={item.id}
            >
                <tr
                    className={twMerge(
                        '[&>td:not(:first-child)]:border-l [&>td:not(:first-child)]:border-gray-300',
                        index % 2 !== 0 && 'bg-gray-50',
                    )}
                >
                    <RWATableCell>{item.id}</RWATableCell>
                    <RWATableCell>{item.coupon}</RWATableCell>
                    <RWATableCell>{item.maturity}</RWATableCell>
                    <RWATableCell>{item.notional}</RWATableCell>
                    <RWATableCell>
                        <button
                            onClick={() => {
                                action('onClickDetails')(item);
                                toggleRow(item.id);
                            }}
                            className="flex size-full items-center justify-center"
                        >
                            <Icon
                                name="caret-down"
                                size={16}
                                className={twMerge(
                                    'text-gray-600',
                                    expandedRow === item.id && 'rotate-180',
                                )}
                            />
                        </button>
                    </RWATableCell>
                </tr>
            </RWATableRow>
        );
    };

    return (
        <RWATable
            {...restProps}
            className={twMerge(expandedRow && 'max-h-max')}
            onClickSort={onClickSort}
            items={sortedItems}
            renderRow={renderRow}
        />
    );
};
