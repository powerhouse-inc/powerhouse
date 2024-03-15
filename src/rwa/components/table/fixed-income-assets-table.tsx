import { Icon } from '@/powerhouse';
import { FixedIncome, FixedIncomeType, SPV } from '@/rwa';
import { addDays } from 'date-fns';
import { useRef } from 'react';
import { twJoin, twMerge } from 'tailwind-merge';
import { RWATable, RWATableCell, RWATableProps, useSortTableItems } from '.';
import { RWAAssetDetails } from '../asset-details';
import { RWAAssetDetailInputs } from '../asset-details/form';
import { RWATableRow } from './expandable-row';
import { useColumnPriority } from './useColumnPriority';
import { handleDateInTable } from './utils';

export type FixedIncomesTableProps = Omit<
    RWATableProps<FixedIncome>,
    'header' | 'renderRow'
> & {
    fixedIncomeTypes: FixedIncomeType[];
    spvs: SPV[];
    columnCountByTableWidth: Record<string, number>;
    fieldsPriority: (keyof FixedIncome)[];
    expandedRowId: string | undefined;
    selectedAssetToEdit?: FixedIncome;
    showNewAssetForm: boolean;
    toggleExpandedRow: (id: string) => void;
    onClickDetails: (item: FixedIncome) => void;
    setSelectedAssetToEdit: (item: FixedIncome) => void;
    onCancelEdit: () => void;
    onSubmitCreate: (data: RWAAssetDetailInputs) => void;
    onSubmitEdit: (data: RWAAssetDetailInputs) => void;
    setShowNewAssetForm: (show: boolean) => void;
};

export function RWAFixedIncomesTable(props: FixedIncomesTableProps) {
    const {
        items,
        fixedIncomeTypes,
        spvs,
        fieldsPriority,
        columnCountByTableWidth,
        expandedRowId,
        selectedAssetToEdit,
        showNewAssetForm,
        toggleExpandedRow,
        onClickDetails,
        setSelectedAssetToEdit,
        onCancelEdit,
        onSubmitCreate,
        onSubmitEdit,
        setShowNewAssetForm,
        ...restProps
    } = props;

    const tableContainerRef = useRef<HTMLDivElement>(null);

    const { fields, headerLabels } = useColumnPriority<FixedIncome>({
        columnCountByTableWidth,
        fieldsPriority,
        tableContainerRef,
    });

    const { sortedItems, sortHandler } = useSortTableItems(items || []);

    const renderRow = (item: FixedIncome, index: number) => {
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
                                onSubmitEdit(data);
                            }}
                        />
                    )
                }
            >
                <tr
                    key={item.id}
                    className={twMerge(
                        '[&>td:not(:first-child)]:border-l [&>td:not(:first-child)]:border-gray-300',
                        index % 2 !== 0 ? 'bg-gray-50' : 'bg-white',
                    )}
                >
                    <RWATableCell>{index + 1}</RWATableCell>
                    {fields.map(field => (
                        <RWATableCell key={field}>
                            {handleDateInTable(item[field]) ?? '--'}
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
        <>
            <RWATable
                {...restProps}
                className={twJoin(
                    'rounded-b-none',
                    expandedRowId && 'max-h-max',
                )}
                onClickSort={sortHandler}
                ref={tableContainerRef}
                items={sortedItems}
                header={headerLabels}
                renderRow={renderRow}
            />
            <button
                onClick={() => setShowNewAssetForm(true)}
                className="flex h-11 w-full items-center justify-center gap-x-2 rounded-b-lg border-x border-b border-gray-300 bg-white text-sm font-semibold text-gray-900"
            >
                <span>Create Asset</span>
                <Icon name="plus" size={14} />
            </button>
            {showNewAssetForm && (
                <div className="mt-4 rounded-md border border-gray-300 bg-white">
                    <RWAAssetDetails
                        asset={{
                            id: '',
                            name: '',
                            fixedIncomeTypeId: fixedIncomeTypes[0].id,
                            spvId: spvs[0].id,
                            maturity: addDays(new Date(), 30)
                                .toISOString()
                                .split('T')[0],
                            notional: 0,
                            coupon: 0,
                            purchasePrice: 0,
                            purchaseDate: '',
                            totalDiscount: 0,
                            purchaseProceeds: 0,
                            annualizedYield: 0,
                        }}
                        mode="edit"
                        operation="create"
                        fixedIncomeTypes={fixedIncomeTypes}
                        spvs={spvs}
                        onClose={() => setShowNewAssetForm(false)}
                        onCancel={() => setShowNewAssetForm(false)}
                        onSubmitForm={onSubmitCreate}
                    />
                </div>
            )}
        </>
    );
}
