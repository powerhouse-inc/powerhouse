import { Icon } from '@/powerhouse';
import { action } from '@storybook/addon-actions';
import type { Meta, StoryObj } from '@storybook/react';
import { orderBy } from 'natural-orderby';
import { useState } from 'react';
import { twMerge } from 'tailwind-merge';
import { RWATableRow } from './expandable-row';
import { RWATable, RWATableProps } from './table';
import { RWATableCell } from './table-cell';

const exampleItems = [
    {
        id: 'example-1',
        exampleField1: 'Example 1-1',
        exampleField2: 'Example 1-2',
        exampleField3: 'Example 1-3',
    },
    {
        id: 'example-2',
        exampleField1: 'Example 2-1',
        exampleField2: 'Example 2-2',
        exampleField3: 'Example 2-3',
    },
    {
        id: 'example-3',
        exampleField1: 'Example 3-1',
        exampleField2: 'Example 3-2',
        exampleField3: 'Example 3-3',
    },
];

type Item = (typeof exampleItems)[number];

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
            {
                id: 'exampleField1',
                label: 'Example Field 1',
                allowSorting: true,
            },
            {
                id: 'exampleField2',
                label: 'Example Field 2',
                allowSorting: true,
            },
            {
                id: 'exampleField3',
                label: 'Example Field 3',
                allowSorting: true,
            },
            { id: 'moreDetails' },
        ],
        items: exampleItems,
        renderRow: (item, index) => (
            <tr
                key={item.id}
                className={twMerge(
                    '[&>td:not(:first-child)]:border-l [&>td:not(:first-child)]:border-gray-300',
                    index % 2 !== 0 && 'bg-gray-50',
                )}
            >
                <RWATableCell>{item.exampleField1}</RWATableCell>
                <RWATableCell>{item.exampleField2}</RWATableCell>
                <RWATableCell>{item.exampleField3}</RWATableCell>
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

    const toggleRow = (id: string) => {
        setExpandedRow(id === expandedRow ? null : id);
    };

    const onClickSort: RWATableProps<Item>['onClickSort'] = (
        column,
        direction,
    ) => {
        console.log('onClickSort', column, direction);
        setSortedItems(
            orderBy(sortedItems, [column as keyof Item], [direction]),
        );
    };

    const renderRow: RWATableProps<Item>['renderRow'] = (item, index) => {
        return (
            <RWATableRow
                isExpanded={expandedRow === item.id}
                tdProps={{ colSpan: 8 }}
                accordionContent={<></>}
                key={item.id}
            >
                <tr
                    className={twMerge(
                        '[&>td:not(:first-child)]:border-l [&>td:not(:first-child)]:border-gray-300',
                        index % 2 !== 0 && 'bg-gray-50',
                    )}
                >
                    <RWATableCell>{item.exampleField1}</RWATableCell>
                    <RWATableCell>{item.exampleField2}</RWATableCell>
                    <RWATableCell>{item.exampleField3}</RWATableCell>
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
