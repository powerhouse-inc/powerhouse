import { Icon } from '@/powerhouse';
import { action } from '@storybook/addon-actions';
import type { Meta, StoryObj } from '@storybook/react';
import { orderBy } from 'natural-orderby';
import { useMemo, useState } from 'react';
import { Row, SortDescriptor } from 'react-aria-components';
import { twMerge } from 'tailwind-merge';
import { RWATable, RWATableProps } from './table';
import { RWATableCell } from './table-cell';

type Item = {
    index: number;
    relatedSpv: string;
    assetId: string;
    assetName: string;
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
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
    args: {
        header: [
            { id: 'index', label: '#' },
            { id: 'relatedSpv', label: 'Related SPV' },
            { id: 'assetId', label: 'Asset ID' },
            { id: 'assetName', label: 'Asset Name' },
            { id: 'coupon', label: 'Coupon' },
            { id: 'maturity', label: 'Maturity' },
            { id: 'notional', label: 'Notional' },
            { id: 'moreDetails', props: { allowsSorting: false } },
        ],
        items: [
            {
                index: 1,
                relatedSpv: 'SPV 1',
                assetId: 'Asset 1',
                assetName: 'Asset 1',
                coupon: '1.00',
                maturity: '1/1/2021',
                notional: '1.00',
            },
            {
                index: 2,
                relatedSpv: 'SPV 2',
                assetId: 'Asset 2',
                assetName: 'Asset 2',
                coupon: '2.00',
                maturity: '2/2/2022',
                notional: '2.00',
            },
            {
                index: 3,
                relatedSpv: 'SPV 3',
                assetId: 'Asset 3',
                assetName: 'Asset 3',
                coupon: '3.00',
                maturity: '3/3/2023',
                notional: '3.00',
            },
            {
                index: 4,
                relatedSpv: 'SPV 4',
                assetId: 'Asset 4',
                assetName: 'Asset 4',
                coupon: '4.00',
                maturity: '4/4/2024',
                notional: '4.00',
            },
            {
                index: 5,
                relatedSpv: 'SPV 5',
                assetId: 'Asset 5',
                assetName: 'Asset 5',
                coupon: '5.00',
                maturity: '5/5/2025',
                notional: '5.00',
            },
            {
                index: 6,
                relatedSpv: 'SPV 6',
                assetId: 'Asset 6',
                assetName: 'Asset 6',
                coupon: '6.00',
                maturity: '6/6/2026',
                notional: '6.00',
            },
            {
                index: 7,
                relatedSpv: 'SPV 7',
                assetId: 'Asset 7',
                assetName: 'Asset 7',
                coupon: '7.00',
                maturity: '7/7/2027',
                notional: '7.00',
            },
            {
                index: 8,
                relatedSpv: 'SPV 8',
                assetId: 'Asset 8',
                assetName: 'Asset 8',
                coupon: '8.00',
                maturity: '8/8/2028',
                notional: '8.00',
            },
            {
                index: 9,
                relatedSpv: 'SPV 9',
                assetId: 'Asset 9',
                assetName: 'Asset 9',
                coupon: '9.00',
                maturity: '9/9/2029',
                notional: '9.00',
            },
            {
                index: 10,
                relatedSpv: 'SPV 10',
                assetId: 'Asset 10',
                assetName: 'Asset 10',
                coupon: '10.00',
                maturity: '10/10/2030',
                notional: '10.00',
            },
        ],
        renderRow: (item, index) => (
            <Row
                key={item.index}
                className={twMerge(
                    '[&>td:not(:first-child)]:border-l [&>td:not(:first-child)]:border-gray-300',
                    index % 2 !== 0 && 'bg-gray-50',
                )}
            >
                <RWATableCell>{item.index}</RWATableCell>
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
            </Row>
        ),
    },
    render: args => <TableDemo {...args} />,
};

const TableDemo = (props: RWATableProps<Item>) => {
    const { items, ...restProps } = props;
    const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>({
        column: 'index',
        direction: 'ascending',
    });

    const onSortChange = (sortDescriptor: SortDescriptor) => {
        setSortDescriptor(sortDescriptor);
        action('onSortChange')(sortDescriptor);
    };

    const sortedItems = useMemo(() => {
        if (!items) return [];
        const order = sortDescriptor.direction === 'ascending' ? 'asc' : 'desc';
        return orderBy(items, [sortDescriptor.column as ItemKey], [order]);
    }, [sortDescriptor, items]);

    return (
        <RWATable
            {...restProps}
            items={sortedItems}
            tableProps={{ sortDescriptor, onSortChange }}
        />
    );
};
