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
import { handleTableDatum } from './utils';

export type GroupTransactionsTableFields = {
    id: string;
    'Entry Time': string | undefined | null;
    Asset: string | undefined | null;
    Quantity: number | undefined | null;
    'Cash Amount ($)': number | undefined | null;
    'Cash Balance Change ($)': number | undefined | null;
};

export const groupTransactionsColumnCountByTableWidth = {
    1520: 12,
    1394: 11,
    1239: 10,
    1112: 9,
    984: 8,
};

export const groupTransactionsFieldsPriority: (keyof GroupTransactionsTableFields)[] =
    [
        'Entry Time',
        'Asset',
        'Quantity',
        'Cash Amount ($)',
        'Cash Balance Change ($)',
    ];

export function mapGroupTransactionsToTableFields(
    transactions: GroupTransaction[] | undefined,
    fixedIncomes: FixedIncome[],
): GroupTransactionsTableFields[] {
    return (transactions ?? [])
        .map(transaction =>
            mapGroupTransactionToTableFields(transaction, fixedIncomes),
        )
        .filter(Boolean);
}

export function mapGroupTransactionToTableFields(
    transaction: GroupTransaction | undefined,
    fixedIncomes: FixedIncome[],
): GroupTransactionsTableFields | undefined {
    if (!transaction) return;
    const fixedIncome = fixedIncomes.find(
        asset => asset.id === transaction.fixedIncomeTransaction?.assetId,
    );
    return {
        id: transaction.id,
        'Entry Time': transaction.entryTime,
        Asset: fixedIncome?.name,
        Quantity: transaction.fixedIncomeTransaction?.amount,
        'Cash Amount ($)': transaction.cashTransaction?.amount,
        'Cash Balance Change ($)': transaction.cashBalanceChange,
    };
}
export function getGroupTransactionById(
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

    const { fields, headerLabels } =
        useColumnPriority<GroupTransactionsTableFields>({
            columnCountByTableWidth: groupTransactionsColumnCountByTableWidth,
            fieldsPriority: groupTransactionsFieldsPriority,
            tableContainerRef,
        });

    const mappedFields = useMemo(
        () => mapGroupTransactionsToTableFields(items, fixedIncomes),
        [items, fixedIncomes],
    );

    const { sortedItems, sortHandler } = useSortTableItems(mappedFields);

    const renderRow = (item: GroupTransactionsTableFields, index: number) => {
        return (
            <RWATableRow
                isExpanded={expandedRowId === item.id}
                tdProps={{ colSpan: 100 }}
                key={item.id}
                accordionContent={
                    expandedRowId === item.id && (
                        <GroupTransactionDetails
                            transaction={getGroupTransactionById(
                                item.id,
                                items,
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
                                    getGroupTransactionById(item.id, items),
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
                            {handleTableDatum(item[field])}
                        </RWATableCell>
                    ))}
                    <RWATableCell>
                        <button
                            className="flex size-full items-center justify-center"
                            onClick={() => {
                                toggleExpandedRow(item.id);
                                onClickDetails(
                                    getGroupTransactionById(item.id, items),
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
