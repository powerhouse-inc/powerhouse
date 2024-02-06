import { Icon } from '@/powerhouse';
import { useRef } from 'react';
import { twMerge } from 'tailwind-merge';
import { RWATable, RWATableCell, RWATableProps } from '.';
import { useColumnPriority } from './useColumnPriority';

const fieldsPriority: (keyof FixedIncome)[] = [
    'id',
    'name',
    'maturity',
    'notional',
    'coupon',
    'purchasePrice',
    'realizedSurplus',
    'purchaseDate',
    'totalDiscount',
    'purchaseProceeds',
    'currentValue',
    'marketValue',
] as const;

export const columnCountByTableWidth = {
    1520: 12,
    1394: 11,
    1239: 10,
    1112: 9,
    984: 8,
} as const;

export type FixedIncome = {
    id: string;
    fixedIncomeTypeId: string;
    name: string;
    spvId: string;
    maturity: string;
    purchaseDate: string;
    notional: number;
    purchasePrice: number;
    purchaseProceeds: number;
    totalDiscount: number;
    marketValue: number;
    annualizedYield: number;
    realizedSurplus: number;
    totalSurplus: number;
    ISIN: string;
    CUSIP: string;
    coupon: number;
    currentValue: number;
};

export type FixedIncomeAssetsTableProps = Omit<
    RWATableProps<Partial<FixedIncome>>,
    'header' | 'renderRow'
> & {
    onClickDetails: (item: Partial<FixedIncome>) => void;
};

export function FixedIncomeAssetsTable(props: FixedIncomeAssetsTableProps) {
    const { items, ...restProps } = props;

    const tableContainerRef = useRef<HTMLDivElement>(null);

    const { fields, headerLabels } = useColumnPriority<Partial<FixedIncome>>({
        columnCountByTableWidth,
        fieldsPriority,
        tableContainerRef,
    });

    // const { sortDescriptor, onSortChange, sortedItems } = useSortTableItems(
    //     items || [],
    // );

    function renderRow(item: Partial<FixedIncome>, index: number) {
        return (
            <tr
                key={item.id}
                className={twMerge(
                    '[&>td:not(:first-child)]:border-l [&>td:not(:first-child)]:border-gray-300',
                    index % 2 !== 0 && 'bg-gray-50',
                )}
            >
                <RWATableCell>{index + 1}</RWATableCell>
                {fields.map(field => (
                    <RWATableCell key={field}>
                        {item[field] ?? '-'}
                    </RWATableCell>
                ))}
                <RWATableCell>
                    <button onClick={() => props.onClickDetails(item)}>
                        <Icon name="arrow-filled-right" size={12} />
                    </button>
                </RWATableCell>
            </tr>
        );
    }

    return (
        <RWATable
            {...restProps}
            ref={tableContainerRef}
            items={items}
            header={headerLabels}
            renderRow={renderRow}
        />
    );
}
