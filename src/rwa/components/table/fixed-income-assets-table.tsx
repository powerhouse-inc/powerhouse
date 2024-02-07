import { Icon } from '@/powerhouse';
import { USDFormat } from '@/rwa';
import { parseDate } from '@internationalized/date';
import { useRef } from 'react';
import { twMerge } from 'tailwind-merge';
import { RWATable, RWATableCell, RWATableProps, useSortTableItems } from '.';
import { RWAAssetDetails, RWAAssetDetailsProps } from '../asset-details';
import { RWATableRow } from './expandable-row';
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
    onEditItem?: (item: Partial<FixedIncome>) => void;
    onCancelEdit?: RWAAssetDetailsProps['onCancel'];
    onSubmitEdit?: RWAAssetDetailsProps['onSubmitForm'];
    expandedRowId?: string | null;
    editRowId?: string | null;
    assetTypeOptions?: { id: string; label: string }[];
    maturityOptions?: { id: string; label: string }[];
};

export function RWAFixedIncomeAssetsTable(props: FixedIncomeAssetsTableProps) {
    const {
        items,
        onEditItem = () => {},
        onCancelEdit = () => {},
        onSubmitEdit = () => {},
        assetTypeOptions = [],
        maturityOptions = [],
        onClickDetails,
        expandedRowId,
        editRowId,
        ...restProps
    } = props;

    const tableContainerRef = useRef<HTMLDivElement>(null);

    const { fields, headerLabels } = useColumnPriority<Partial<FixedIncome>>({
        columnCountByTableWidth,
        fieldsPriority,
        tableContainerRef,
    });

    const { sortedItems, sortHandler } = useSortTableItems(items || []);

    const renderRow = (item: Partial<FixedIncome>, index: number) => {
        return (
            <RWATableRow
                isExpanded={expandedRowId === item.id}
                tdProps={{ colSpan: 100 }}
                key={item.id}
                accordionContent={
                    <RWAAssetDetails
                        asset={{
                            assetName: item.name || '',
                            assetTypeId: '91279GF8',
                            currentValue: USDFormat(item.currentValue || 0),
                            id: item.id || '',
                            cusip: USDFormat(item.CUSIP || 0),
                            isin: USDFormat(item.ISIN || 0),
                            maturityDate: 'purchase',
                            notional: USDFormat(item.notional || 0),
                            purchaseProceeds: USDFormat(
                                item.purchaseProceeds || 0,
                            ),
                            purchaseTimestamp: parseDate(
                                item.purchaseDate || '',
                            ),
                            realisedSurplus: USDFormat(
                                item.realizedSurplus || 0,
                            ),
                            totalDiscount: USDFormat(item.totalDiscount || 0),
                            totalSurplus: USDFormat(item.totalSurplus || 0),
                            unitPrice: USDFormat(item.purchasePrice || 0),
                        }}
                        className="border-y border-gray-300"
                        assetTypeOptions={assetTypeOptions}
                        maturityOptions={maturityOptions}
                        mode={editRowId === item.id ? 'edit' : 'view'}
                        onCancel={onCancelEdit}
                        onEdit={() => onEditItem(item)}
                        onSubmitForm={onSubmitEdit}
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
                            onClick={() => onClickDetails(item)}
                        >
                            <Icon
                                name="caret-down"
                                size={16}
                                className={twMerge(
                                    'text-gray-600',
                                    expandedRowId === item.id && 'rotate-180',
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
            onClickSort={sortHandler}
            ref={tableContainerRef}
            items={sortedItems}
            header={headerLabels}
            renderRow={renderRow}
        />
    );
}
