import { Icon } from '@/powerhouse';
import { FixedIncomeAsset, FixedIncomeType, SPV } from '@/rwa';
import { useRef } from 'react';
import { twMerge } from 'tailwind-merge';
import { RWATable, RWATableCell, RWATableProps, useSortTableItems } from '.';
import { RWAAssetDetails } from '../asset-details';
import { RWAAssetDetailInputs } from '../asset-details/form';
import { RWATableRow } from './expandable-row';
import { useColumnPriority } from './useColumnPriority';

export type FixedIncomeAssetsTableProps = Omit<
    RWATableProps<FixedIncomeAsset>,
    'header' | 'renderRow'
> & {
    fixedIncomeTypes: FixedIncomeType[];
    spvs: SPV[];
    columnCountByTableWidth: Record<string, number>;
    fieldsPriority: (keyof FixedIncomeAsset)[];
    expandedRowId: string | undefined;
    selectedAssetToEdit?: FixedIncomeAsset;
    toggleExpandedRow: (id: string) => void;
    onClickDetails: (item: FixedIncomeAsset) => void;
    setSelectedAssetToEdit: (item: FixedIncomeAsset) => void;
    onCancelEdit: () => void;
    onSubmitForm: (data: RWAAssetDetailInputs) => void;
};

export function RWAFixedIncomeAssetsTable(props: FixedIncomeAssetsTableProps) {
    const {
        items,
        fixedIncomeTypes,
        spvs,
        fieldsPriority,
        columnCountByTableWidth,
        expandedRowId,
        selectedAssetToEdit,
        toggleExpandedRow,
        onClickDetails,
        setSelectedAssetToEdit,
        onCancelEdit,
        onSubmitForm,
        ...restProps
    } = props;

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
                isExpanded={expandedRowId === item.id}
                tdProps={{ colSpan: 100 }}
                key={item.id}
                accordionContent={
                    expandedRowId === item.id && (
                        <RWAAssetDetails
                            asset={item}
                            fixedIncomeTypes={fixedIncomeTypes}
                            spvs={spvs}
                            className="border-y border-gray-300"
                            mode={
                                selectedAssetToEdit?.id === item.id
                                    ? 'edit'
                                    : 'view'
                            }
                            selectItemToEdit={() => {
                                setSelectedAssetToEdit(item);
                            }}
                            onCancel={() => {
                                onCancelEdit();
                            }}
                            onSubmitForm={data => {
                                onSubmitForm(data);
                            }}
                        />
                    )
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
                                toggleExpandedRow(item.id);
                                onClickDetails(item);
                            }}
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
            className={twMerge(expandedRowId && 'max-h-max')}
            onClickSort={sortHandler}
            ref={tableContainerRef}
            items={sortedItems}
            header={headerLabels}
            renderRow={renderRow}
        />
    );
}
