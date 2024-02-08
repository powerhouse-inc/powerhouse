import {
    RWAFixedIncomeAssetsTable,
    FixedIncomeAssetsTableProps,
    Icon,
    RWAAssetDetails,
} from '@powerhousedao/design-system';
import { useState } from 'react';
import { mockFixedIncomeAssetsData } from './assets-mock-data';
import { twMerge } from 'tailwind-merge';
import { CalendarDate } from '@internationalized/date';

// TODO: replace with real data
const assetTypeOptions = [
    { id: '91279GF8', label: 'T-Bill 91279GF8' },
    { id: '91279GF9', label: 'T-Bill 91279GF9' },
];

// TODO: replace with real data
const maturityOptions = [
    { id: 'purchase', label: 'Purchase' },
    { id: 'mature', label: 'Mature' },
];

export const Portfolio = () => {
    const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
    const [editRowId, setEditRowId] = useState<string | null>(null);
    const [showNewAssetForm, setShowNewAssetForm] = useState(false);

    const onClickDetails: FixedIncomeAssetsTableProps['onClickDetails'] =
        item => {
            setExpandedRowId(
                item.id === expandedRowId ? null : item.id || null,
            );
        };

    const onEditItem: FixedIncomeAssetsTableProps['onEditItem'] = item =>
        setEditRowId(item.id || null);

    const onCancelEdit: FixedIncomeAssetsTableProps['onCancelEdit'] = reset => {
        reset();
        setEditRowId(null);
    };

    const onSubmitEdit: FixedIncomeAssetsTableProps['onSubmitEdit'] = (
        data,
        reset,
    ) => {
        // TODO: dispatch edit asset action
        console.log('onSubmitEdit', data);
        console.log('reset', reset);
        setEditRowId(null);
    };

    const onSubmitCreate: FixedIncomeAssetsTableProps['onSubmitEdit'] = (
        data,
        reset,
    ) => {
        // TODO: dispatch create asset action
        console.log('onSubmitCreate', data);
        console.log('reset', reset);
        setShowNewAssetForm(false);
    };

    const today = new Date();

    return (
        <div>
            <h1 className="text-lg font-bold mb-2">Portfolio</h1>
            <p className="text-xs text-gray-600 mb-4">
                Details on the distribution of assets among different financial
                institutions or investment vehicles.
            </p>
            <div>
                <RWAFixedIncomeAssetsTable
                    className={twMerge(
                        'bg-white',
                        expandedRowId && 'max-h-[680px]',
                    )}
                    items={mockFixedIncomeAssetsData}
                    expandedRowId={expandedRowId}
                    editRowId={editRowId}
                    onClickDetails={onClickDetails}
                    onEditItem={onEditItem}
                    onCancelEdit={onCancelEdit}
                    onSubmitEdit={onSubmitEdit}
                    assetTypeOptions={assetTypeOptions}
                    maturityOptions={maturityOptions}
                    footer={
                        <button
                            onClick={() => setShowNewAssetForm(true)}
                            className="flex h-[42px] text-gray-900 text-sm font-semibold justify-center items-center w-full bg-white gap-x-2"
                        >
                            <span>Create Asset</span>
                            <Icon name="plus" size={14} />
                        </button>
                    }
                />
            </div>
            {showNewAssetForm && (
                <div className="bg-white mt-4 rounded-md border border-gray-300">
                    <RWAAssetDetails
                        mode="edit"
                        operation="create"
                        onClose={() => setShowNewAssetForm(false)}
                        onCancel={() => setShowNewAssetForm(false)}
                        onEdit={() => {}}
                        onSubmitForm={onSubmitCreate}
                        assetTypeOptions={assetTypeOptions}
                        maturityOptions={maturityOptions}
                        hideNonEditableFields
                        asset={{
                            assetName: '',
                            assetTypeId: '',
                            currentValue: '',
                            cusip: '',
                            id: 'temp-id',
                            isin: '',
                            maturityDate: '',
                            notional: '',
                            purchaseProceeds: '',
                            purchaseTimestamp: new CalendarDate(
                                today.getFullYear(),
                                today.getMonth() + 1,
                                today.getDate(),
                            ),
                            realisedSurplus: '',
                            totalDiscount: '',
                            totalSurplus: '',
                            unitPrice: '0',
                        }}
                    />
                </div>
            )}
        </div>
    );
};
