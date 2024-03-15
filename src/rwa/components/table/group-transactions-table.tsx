import { Icon } from '@/powerhouse';
import {
    CashAsset,
    FixedIncome,
    GroupTransaction,
    GroupTransactionDetailInputs,
    GroupTransactionDetails,
    ServiceProviderFeeType,
} from '@/rwa';
import { useMemo, useRef } from 'react';
import { twJoin, twMerge } from 'tailwind-merge';
import { RWATable, RWATableCell, RWATableProps, useSortTableItems } from '.';
import { RWATableRow } from './expandable-row';
import { useColumnPriority } from './useColumnPriority';
import { handleDateInTable } from './utils';

export type Fields = {
    id: string;
    'Entry time': string | undefined | null;
    Asset: string | undefined | null;
    Quantity: number | undefined | null;
    'Cash Amount': number | undefined | null;
    'Cash Balance Change': number | undefined | null;
};

export function mapGroupTransactionsToTableFields(
    transactions: GroupTransaction[] | undefined,
    cashAssets: CashAsset[],
    fixedIncomes: FixedIncome[],
): Fields[] {
    return (transactions ?? [])
        .map(transaction =>
            mapGroupTransactionToTableFields(
                transaction,
                cashAssets,
                fixedIncomes,
            ),
        )
        .filter(Boolean);
}

export function mapGroupTransactionToTableFields(
    transaction: GroupTransaction | undefined,
    cashAssets: CashAsset[],
    fixedIncomes: FixedIncome[],
): Fields | undefined {
    if (!transaction) return;
    const fixedIncome = fixedIncomes.find(
        asset => asset.id === transaction.fixedIncomeTransaction?.assetId,
    );
    return {
        id: transaction.id,
        'Entry time': transaction.entryTime,
        Asset: fixedIncome?.name,
        Quantity: transaction.fixedIncomeTransaction?.amount,
        'Cash Amount': transaction.cashTransaction?.amount,
        'Cash Balance Change': transaction.cashBalanceChange,
    };
}
export function getTransactionsForFieldsById(
    id: string,
    transactions: GroupTransaction[] | undefined,
) {
    return transactions?.find(transaction => transaction.id === id);
}

export type GroupTransactionsTableProps = Omit<
    RWATableProps<GroupTransaction>,
    'header' | 'renderRow'
> & {
    cashAssets: CashAsset[];
    fixedIncomes: FixedIncome[];
    serviceProviderFeeTypes: ServiceProviderFeeType[];
    principalLenderAccountId: string;
    columnCountByTableWidth: Record<string, number>;
    fieldsPriority: (keyof Fields)[];
    expandedRowId: string | undefined;
    selectedGroupTransactionToEdit?: GroupTransaction | null | undefined;
    showNewGroupTransactionForm: boolean;
    setShowNewGroupTransactionForm: (show: boolean) => void;
    toggleExpandedRow: (id: string) => void;
    onClickDetails: (item: GroupTransaction | undefined) => void;
    setSelectedGroupTransactionToEdit: (
        item: GroupTransaction | undefined,
    ) => void;
    onCancelEdit: () => void;
    onSubmitEdit: (data: GroupTransactionDetailInputs) => void;
    onSubmitCreate: (data: GroupTransactionDetailInputs) => void;
};

export function GroupTransactionsTable(props: GroupTransactionsTableProps) {
    const {
        items,
        fixedIncomes,
        cashAssets,
        serviceProviderFeeTypes,
        principalLenderAccountId,
        fieldsPriority,
        columnCountByTableWidth,
        expandedRowId,
        selectedGroupTransactionToEdit,
        showNewGroupTransactionForm,
        setShowNewGroupTransactionForm,
        toggleExpandedRow,
        onClickDetails,
        setSelectedGroupTransactionToEdit,
        onCancelEdit,
        onSubmitEdit,
        onSubmitCreate,
        ...restProps
    } = props;

    const tableContainerRef = useRef<HTMLDivElement>(null);

    const { fields, headerLabels } = useColumnPriority<Fields>({
        columnCountByTableWidth,
        fieldsPriority,
        tableContainerRef,
    });

    const mappedFields = useMemo(
        () =>
            mapGroupTransactionsToTableFields(items, cashAssets, fixedIncomes),
        [items, cashAssets, fixedIncomes],
    );

    const { sortedItems, sortHandler } = useSortTableItems(mappedFields);

    const renderRow = (item: Fields, index: number) => {
        return (
            <RWATableRow
                isExpanded={expandedRowId === item.id}
                tdProps={{ colSpan: 100 }}
                key={item.id}
                accordionContent={
                    expandedRowId === item.id && (
                        <GroupTransactionDetails
                            transaction={items?.find(
                                ({ id }) => id === item.id,
                            )}
                            className="border-y border-gray-300"
                            fixedIncomes={fixedIncomes}
                            serviceProviderFeeTypes={serviceProviderFeeTypes}
                            transactionNumber={index + 1}
                            operation={
                                selectedGroupTransactionToEdit?.id === item.id
                                    ? 'edit'
                                    : 'view'
                            }
                            selectItemToEdit={() => {
                                setSelectedGroupTransactionToEdit(
                                    getTransactionsForFieldsById(
                                        item.id,
                                        items,
                                    ),
                                );
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
                        index % 2 !== 0 && 'bg-gray-50',
                    )}
                >
                    <RWATableCell>{index + 1}</RWATableCell>
                    {fields.map(field => (
                        <RWATableCell key={field}>
                            {handleDateInTable(item[field] ?? '--')}
                        </RWATableCell>
                    ))}
                    <RWATableCell>
                        <button
                            className="flex size-full items-center justify-center"
                            onClick={() => {
                                toggleExpandedRow(item.id);
                                onClickDetails(
                                    getTransactionsForFieldsById(
                                        item.id,
                                        items,
                                    ),
                                );
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
                onClick={() => setShowNewGroupTransactionForm(true)}
                className="flex h-11 w-full items-center justify-center gap-x-2 rounded-b-lg border-x border-b border-gray-300 bg-white text-sm font-semibold text-gray-900"
            >
                <span>Create Group Transaction</span>
                <Icon name="plus" size={14} />
            </button>
            {showNewGroupTransactionForm && (
                <div className="mt-4 rounded-md bg-white">
                    <GroupTransactionDetails
                        transaction={{
                            id: '',
                            type: 'AssetPurchase',
                            cashTransaction: {
                                id: '',
                                assetId: cashAssets[0].id,
                                amount: undefined,
                                counterPartyAccountId: principalLenderAccountId,
                            },
                            fixedIncomeTransaction: {
                                id: '',
                                assetId: fixedIncomes[0].id,
                                amount: null,
                            },
                        }}
                        fixedIncomes={fixedIncomes}
                        serviceProviderFeeTypes={serviceProviderFeeTypes}
                        operation="create"
                        transactionNumber={(items?.length ?? 0) + 1}
                        onCancel={() => setShowNewGroupTransactionForm(false)}
                        onSubmitForm={onSubmitCreate}
                    />
                </div>
            )}
        </>
    );
}
