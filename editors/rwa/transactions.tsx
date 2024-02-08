import { useState } from 'react';
import {
    RWATable,
    USDFormat,
    RWATableCell,
    RWATXDetail,
    RWATXDetailProps,
    useSortTableItems,
} from '@powerhousedao/design-system';
import { txMockData, TXMock } from './tx-mock-data';
import { twMerge } from 'tailwind-merge';
import { parseDate } from '@internationalized/date';

type SortableTXMockColumns = Pick<
    TXMock,
    | 'id'
    | 'timestamp'
    | 'assetTypeId'
    | 'quantity'
    | 'amount'
    | 'cashBalanceChange'
>;

const headerTable = [
    { id: 'id', label: '#', allowSorting: true },
    { id: 'timestamp', label: 'Timestamp', allowSorting: true },
    { id: 'assetTypeId', label: 'Asset', allowSorting: true },
    { id: 'quantity', label: 'Quantity', allowSorting: true },
    { id: 'amount', label: '$USD Amount', allowSorting: true },
    {
        id: 'cashBalanceChange',
        label: 'Cash Balance Change',
        allowSorting: true,
    },
];

// TODO: replace with real data
const assetTypeOptions = [
    { id: '91279GF8', label: 'T-Bill 91279GF8' },
    { id: '91279GF9', label: 'T-Bill 91279GF9' },
    { id: '912796YJ2', label: 'T-Bill 912796YJ2' },
];

// TODO: replace with real data
const cusipIsinAssetNameOptions = [
    { id: 'purchase', label: 'Purchase' },
    { id: 'mature', label: 'Mature' },
];

export const Transactions = () => {
    const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
    const [editMode, setEditMode] = useState(false);
    const { sortedItems, sortHandler } =
        useSortTableItems<SortableTXMockColumns>(txMockData);

    const selectedTx = txMockData.find(tx => tx.id === selectedTxId);

    const onSubmitEditTx: RWATXDetailProps['onSubmit'] = data => {
        // TODO: dispatch edit tx action
        console.log('onSubmitEditTx', data);
    };

    return (
        <div>
            <h1 className="text-lg font-bold mb-2">Transactions</h1>
            <p className="text-xs text-gray-600 mb-4">
                Details of this portfolios transactions
            </p>
            <div>
                <RWATable
                    onClickSort={sortHandler}
                    className="bg-white"
                    header={headerTable}
                    items={sortedItems}
                    renderRow={(item, index) => (
                        <tr
                            key={item.id}
                            className={twMerge(
                                '[&>td:not(:first-child)]:border-l [&>td:not(:first-child)]:border-gray-300',
                                index % 2 !== 0 && 'bg-gray-50',
                            )}
                        >
                            <RWATableCell
                                className="hover:underline cursor-pointer"
                                onClick={() => setSelectedTxId(item.id)}
                            >
                                {item.id}
                            </RWATableCell>
                            <RWATableCell>{item.timestamp}</RWATableCell>
                            <RWATableCell>{item.assetTypeId}</RWATableCell>
                            <RWATableCell>{item.quantity}</RWATableCell>
                            <RWATableCell>
                                {USDFormat(item.amount)}
                            </RWATableCell>
                            <RWATableCell>
                                {USDFormat(item.cashBalanceChange)}
                            </RWATableCell>
                        </tr>
                    )}
                />
            </div>
            {selectedTx && (
                <div className="bg-white mt-4">
                    <RWATXDetail
                        mode={editMode ? 'edit' : 'view'}
                        assetTypeOptions={assetTypeOptions}
                        cusipIsinAssetNameOptions={cusipIsinAssetNameOptions}
                        onSubmit={onSubmitEditTx}
                        onEdit={() => setEditMode(true)}
                        onCancel={() => {
                            setEditMode(false);
                        }}
                        tx={{
                            ...selectedTx,
                            cusipIsinAssetNameId: selectedTx.assetTypeId,
                            timestamp: parseDate(selectedTx.timestamp),
                            assetProceedsUSD: USDFormat(
                                selectedTx.assetProceedsUSD,
                            ),
                            unitPrice: `${selectedTx.unitPrice} %`,
                            cashBalanceChange: USDFormat(
                                selectedTx.cashBalanceChange,
                            ),
                        }}
                    />
                </div>
            )}
        </div>
    );
};
