import { Icon } from '@/powerhouse';
import { FixedIncomeAsset, FixedIncomeType, SPV } from '@/rwa';
import { useRef, useState } from 'react';
import { twMerge } from 'tailwind-merge';
import { RWATable, RWATableCell, RWATableProps, useSortTableItems } from '.';
import { RWAAssetDetails, RWAAssetDetailsProps } from '../asset-details';
import { RWATableRow } from './expandable-row';
import { useColumnPriority } from './useColumnPriority';

const fieldsPriority: (keyof FixedIncomeAsset)[] = [
    'id',
    'name',
    'maturity',
    'notional',
    'coupon',
    'purchasePrice',
    'purchaseDate',
    'totalDiscount',
    'purchaseProceeds',
] as const;

export const columnCountByTableWidth = {
    1520: 12,
    1394: 11,
    1239: 10,
    1112: 9,
    984: 8,
} as const;

export type FixedIncomeAssetsTableProps = Omit<
    RWATableProps<FixedIncomeAsset>,
    'header' | 'renderRow'
> & {
    fixedIncomeTypes: FixedIncomeType[];
    spvs: SPV[];
    onClickDetails: (item: FixedIncomeAsset) => void;
    onEditItem?: (item: FixedIncomeAsset) => void;
    onCancelEdit?: RWAAssetDetailsProps['onCancel'];
    onSubmitEdit?: RWAAssetDetailsProps['onSubmitForm'];
};

export function RWAFixedIncomeAssetsTable(props: FixedIncomeAssetsTableProps) {
    const { items, fixedIncomeTypes, spvs, onClickDetails, ...restProps } =
        props;
    const [expandedRow, setExpandedRow] = useState<string | null>(null);
    const [editRow, setEditRow] = useState<string | null>(null);

    const toggleRow = (id: string) => {
        setExpandedRow(id === expandedRow ? null : id);
    };

    const tableContainerRef = useRef<HTMLDivElement>(null);

    const { fields, headerLabels } = useColumnPriority<FixedIncomeAsset>({
        columnCountByTableWidth,
        fieldsPriority,
        tableContainerRef,
    });

    const { sortedItems, sortHandler } = useSortTableItems(items || []);

    const renderRow = (item: FixedIncomeAsset, index: number) => {
        return (
            <RWATableRow
                isExpanded={expandedRow === item.id}
                tdProps={{ colSpan: 100 }}
                key={item.id}
                accordionContent={
                    <RWAAssetDetails
                        asset={item}
                        fixedIncomeTypes={fixedIncomeTypes}
                        spvs={spvs}
                        className="border-y border-gray-300"
                        mode={editRow === item.id ? 'edit' : 'view'}
                        onCancel={() => {
                            setEditRow(null);
                        }}
                        onEdit={() => setEditRow(item.id)}
                        onSubmitForm={() => {
                            setEditRow(null);
                        }}
                    />
                }
            >
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
                        <button
                            className="flex size-full items-center justify-center"
                            onClick={() => {
                                toggleRow(item.id);
                                onClickDetails(item);
                            }}
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
            onClickSort={sortHandler}
            ref={tableContainerRef}
            items={sortedItems}
            header={headerLabels}
            renderRow={renderRow}
        />
    );
}
