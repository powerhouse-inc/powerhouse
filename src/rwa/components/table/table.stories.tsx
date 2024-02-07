import { Icon } from '@/powerhouse';
import { CalendarDate } from '@internationalized/date';
import { action } from '@storybook/addon-actions';
import type { Meta, StoryObj } from '@storybook/react';
import { orderBy } from 'natural-orderby';
import { useState } from 'react';
import { twMerge } from 'tailwind-merge';
import { RWAAssetDetail, RWAAssetDetails } from '../asset-details';
import { RWATableRow } from './expandable-row';
import { RWATable, RWATableProps } from './table';
import { RWATableCell } from './table-cell';

type Item = RWAAssetDetail & {
    relatedSpv: string;
    assetId: string;
    coupon: string;
    maturity: string;
    notional: string;
};

type ItemKey = keyof Item;

const meta: Meta<typeof RWATable<Item>> = {
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
        items: [
            {
                relatedSpv: 'SPV 1',
                assetId: 'Asset 1',
                assetName: 'Asset 1',
                coupon: '1.00',
                maturity: '1/1/2021',
                notional: '1.00',
                id: '1',
                purchaseTimestamp: new CalendarDate(2024, 1, 12),
                assetTypeId: '91279GF8',
                maturityDate: 'purchase',
                cusip: '$1,000,000.00',
                isin: '$1,000,000.00',
                purchaseProceeds: '$1,000,000.00',
                totalDiscount: '200,000',
                currentValue: '1,656,073.70',
                realisedSurplus: '0',
                totalSurplus: '1,656,073.70',
                unitPrice: '99.64%',
            },
            {
                relatedSpv: 'SPV 2',
                assetId: 'Asset 2',
                assetName: 'Asset 2',
                coupon: '2.00',
                maturity: '2/2/2022',
                notional: '2.00',
                id: '2',
                purchaseTimestamp: new CalendarDate(2024, 1, 12),
                assetTypeId: '91279GF8',
                maturityDate: 'purchase',
                cusip: '$1,000,000.00',
                isin: '$1,000,000.00',
                purchaseProceeds: '$1,000,000.00',
                totalDiscount: '200,000',
                currentValue: '1,656,073.70',
                realisedSurplus: '0',
                totalSurplus: '1,656,073.70',
                unitPrice: '99.64%',
            },
            {
                relatedSpv: 'SPV 3',
                assetId: 'Asset 3',
                assetName: 'Asset 3',
                coupon: '3.00',
                maturity: '3/3/2023',
                notional: '3.00',
                id: '3',
                purchaseTimestamp: new CalendarDate(2024, 1, 12),
                assetTypeId: '91279GF8',
                maturityDate: 'purchase',
                cusip: '$1,000,000.00',
                isin: '$1,000,000.00',
                purchaseProceeds: '$1,000,000.00',
                totalDiscount: '200,000',
                currentValue: '1,656,073.70',
                realisedSurplus: '0',
                totalSurplus: '1,656,073.70',
                unitPrice: '99.64%',
            },
            {
                relatedSpv: 'SPV 4',
                assetId: 'Asset 4',
                assetName: 'Asset 4',
                coupon: '4.00',
                maturity: '4/4/2024',
                notional: '4.00',
                id: '4',
                purchaseTimestamp: new CalendarDate(2024, 1, 12),
                assetTypeId: '91279GF8',
                maturityDate: 'purchase',
                cusip: '$1,000,000.00',
                isin: '$1,000,000.00',
                purchaseProceeds: '$1,000,000.00',
                totalDiscount: '200,000',
                currentValue: '1,656,073.70',
                realisedSurplus: '0',
                totalSurplus: '1,656,073.70',
                unitPrice: '99.64%',
            },
            {
                relatedSpv: 'SPV 5',
                assetId: 'Asset 5',
                assetName: 'Asset 5',
                coupon: '5.00',
                maturity: '5/5/2025',
                notional: '5.00',
                id: '5',
                purchaseTimestamp: new CalendarDate(2024, 1, 12),
                assetTypeId: '91279GF8',
                maturityDate: 'purchase',
                cusip: '$1,000,000.00',
                isin: '$1,000,000.00',
                purchaseProceeds: '$1,000,000.00',
                totalDiscount: '200,000',
                currentValue: '1,656,073.70',
                realisedSurplus: '0',
                totalSurplus: '1,656,073.70',
                unitPrice: '99.64%',
            },
            {
                relatedSpv: 'SPV 6',
                assetId: 'Asset 6',
                assetName: 'Asset 6',
                coupon: '6.00',
                maturity: '6/6/2026',
                notional: '6.00',
                id: '6',
                purchaseTimestamp: new CalendarDate(2024, 1, 12),
                assetTypeId: '91279GF8',
                maturityDate: 'purchase',
                cusip: '$1,000,000.00',
                isin: '$1,000,000.00',
                purchaseProceeds: '$1,000,000.00',
                totalDiscount: '200,000',
                currentValue: '1,656,073.70',
                realisedSurplus: '0',
                totalSurplus: '1,656,073.70',
                unitPrice: '99.64%',
            },
            {
                relatedSpv: 'SPV 7',
                assetId: 'Asset 7',
                assetName: 'Asset 7',
                coupon: '7.00',
                maturity: '7/7/2027',
                notional: '7.00',
                id: '7',
                purchaseTimestamp: new CalendarDate(2024, 1, 12),
                assetTypeId: '91279GF8',
                maturityDate: 'purchase',
                cusip: '$1,000,000.00',
                isin: '$1,000,000.00',
                purchaseProceeds: '$1,000,000.00',
                totalDiscount: '200,000',
                currentValue: '1,656,073.70',
                realisedSurplus: '0',
                totalSurplus: '1,656,073.70',
                unitPrice: '99.64%',
            },
            {
                relatedSpv: 'SPV 8',
                assetId: 'Asset 8',
                assetName: 'Asset 8',
                coupon: '8.00',
                maturity: '8/8/2028',
                notional: '8.00',
                id: '8',
                purchaseTimestamp: new CalendarDate(2024, 1, 12),
                assetTypeId: '91279GF8',
                maturityDate: 'purchase',
                cusip: '$1,000,000.00',
                isin: '$1,000,000.00',
                purchaseProceeds: '$1,000,000.00',
                totalDiscount: '200,000',
                currentValue: '1,656,073.70',
                realisedSurplus: '0',
                totalSurplus: '1,656,073.70',
                unitPrice: '99.64%',
            },
            {
                relatedSpv: 'SPV 9',
                assetId: 'Asset 9',
                assetName: 'Asset 9',
                coupon: '9.00',
                maturity: '9/9/2029',
                notional: '9.00',
                id: '9',
                purchaseTimestamp: new CalendarDate(2024, 1, 12),
                assetTypeId: '91279GF8',
                maturityDate: 'purchase',
                cusip: '$1,000,000.00',
                isin: '$1,000,000.00',
                purchaseProceeds: '$1,000,000.00',
                totalDiscount: '200,000',
                currentValue: '1,656,073.70',
                realisedSurplus: '0',
                totalSurplus: '1,656,073.70',
                unitPrice: '99.64%',
            },
            {
                relatedSpv: 'SPV 10',
                assetId: 'Asset 10',
                assetName: 'Asset 10',
                coupon: '10.00',
                maturity: '10/10/2030',
                notional: '10.00',
                id: '10',
                purchaseTimestamp: new CalendarDate(2024, 1, 12),
                assetTypeId: '91279GF8',
                maturityDate: 'purchase',
                cusip: '$1,000,000.00',
                isin: '$1,000,000.00',
                purchaseProceeds: '$1,000,000.00',
                totalDiscount: '200,000',
                currentValue: '1,656,073.70',
                realisedSurplus: '0',
                totalSurplus: '1,656,073.70',
                unitPrice: '99.64%',
            },
        ],
        renderRow: (item, index) => (
            <tr
                key={item.id}
                className={twMerge(
                    '[&>td:not(:first-child)]:border-l [&>td:not(:first-child)]:border-gray-300',
                    index % 2 !== 0 && 'bg-gray-50',
                )}
            >
                <RWATableCell>{item.id}</RWATableCell>
                <RWATableCell>{item.relatedSpv}</RWATableCell>
                <RWATableCell>{item.assetId}</RWATableCell>
                <RWATableCell>{item.assetName}</RWATableCell>
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

const TableDemo = (props: RWATableProps<Item>) => {
    const { items, ...restProps } = props;

    const [sortedItems, setSortedItems] = useState(items || []);
    const [expandedRow, setExpandedRow] = useState<string | null>(null);
    const [editRow, setEditRow] = useState<string | null>(null);

    const toggleRow = (id: string) => {
        setExpandedRow(id === expandedRow ? null : id);
    };

    const onClickSort: RWATableProps<Item>['onClickSort'] = (
        column,
        direction,
    ) => {
        console.log('onClickSort', column, direction);
        setSortedItems(orderBy(sortedItems, [column as ItemKey], [direction]));
    };

    const renderRow: RWATableProps<Item>['renderRow'] = (item, index) => {
        return (
            <RWATableRow
                isExpanded={expandedRow === item.id}
                tdProps={{ colSpan: 8 }}
                accordionContent={
                    <RWAAssetDetails
                        asset={item}
                        className="border-y border-gray-300"
                        assetTypeOptions={assetTypeOptions}
                        maturityOptions={maturityOptions}
                        mode={editRow === item.id ? 'edit' : 'view'}
                        onCancel={() => setEditRow(null)}
                        onEdit={() => setEditRow(item.id)}
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
                    <RWATableCell>{item.relatedSpv}</RWATableCell>
                    <RWATableCell>{item.assetId}</RWATableCell>
                    <RWATableCell>{item.assetName}</RWATableCell>
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
            className={twMerge(expandedRow && 'max-h-[680px]')}
            onClickSort={onClickSort}
            items={sortedItems}
            renderRow={renderRow}
        />
    );
};

const assetTypeOptions = [
    { id: '91279GF8', label: 'T-Bill 91279GF8' },
    { id: '91279GF9', label: 'T-Bill 91279GF9' },
];

const maturityOptions = [
    { id: 'purchase', label: 'Purchase' },
    { id: 'mature', label: 'Mature' },
];
