import {
    FixedIncomeAsset,
    FixedIncomeAssetsTableProps,
    Icon,
    RWAAssetDetails,
    RWAFixedIncomeAssetsTable,
} from '@powerhousedao/design-system';
import { RWAAssetDetailInputs } from '@powerhousedao/design-system/dist/rwa/components/asset-details/form';
import { addDays } from 'date-fns';
import { utils } from 'document-model/document';
import { useCallback, useState } from 'react';
import { twMerge } from 'tailwind-merge';
import {
    FixedIncome,
    actions,
    getDifferences,
    isFixedIncomeAsset,
} from '../../document-models/real-world-assets';
import { mockFixedIncomeTypes, mockSpvs } from './assets-mock-data';
import { IProps } from './editor';

const fieldsPriority: (keyof FixedIncomeAsset)[] = [
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

function createAssetFromFormInputs(data: RWAAssetDetailInputs) {
    const maturity = data.maturity.toString() + 'T00:00:00.000Z';
    return {
        ...data,
        maturity,
    };
}

export const Portfolio = (props: IProps) => {
    const [expandedRowId, setExpandedRowId] = useState<string>();
    const [selectedAssetToEdit, setSelectedAssetToEdit] =
        useState<FixedIncomeAsset>();
    const [showNewAssetForm, setShowNewAssetForm] = useState(false);

    const { dispatch, document } = props;

    const spvs = document.state.global.spvs;

    const fixedIncomeTypes = document.state.global.fixedIncomeTypes;

    const portfolio = document.state.global.portfolio.filter(
        (asset): asset is FixedIncome => isFixedIncomeAsset(asset),
    ) as FixedIncomeAsset[];

    const toggleExpandedRow = useCallback((id: string) => {
        setExpandedRowId(curr => (id === curr ? undefined : id));
    }, []);

    const onClickDetails: FixedIncomeAssetsTableProps['onClickDetails'] =
        useCallback(item => {}, []);

    const onCancelEdit: FixedIncomeAssetsTableProps['onCancelEdit'] =
        useCallback(() => {
            setSelectedAssetToEdit(undefined);
        }, []);

    const onSubmitEdit: FixedIncomeAssetsTableProps['onSubmitForm'] =
        useCallback(
            data => {
                if (!selectedAssetToEdit) return;
                const asset = createAssetFromFormInputs(data);
                const changedFields = getDifferences(
                    selectedAssetToEdit,
                    asset,
                );

                if (Object.values(changedFields).filter(Boolean).length === 0) {
                    setSelectedAssetToEdit(undefined);
                    return;
                }

                dispatch(
                    actions.editFixedIncomeAsset({
                        ...changedFields,
                        id: selectedAssetToEdit.id,
                    }),
                );
                setSelectedAssetToEdit(undefined);
            },
            [dispatch, selectedAssetToEdit],
        );

    const onSubmitCreate: FixedIncomeAssetsTableProps['onSubmitForm'] =
        useCallback(
            data => {
                const asset = createAssetFromFormInputs(data);
                dispatch(
                    actions.createFixedIncomeAsset({
                        ...asset,
                        id: utils.hashKey(),
                    }),
                );
                setShowNewAssetForm(false);
            },
            [dispatch],
        );

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
                    items={portfolio}
                    fixedIncomeTypes={fixedIncomeTypes}
                    spvs={spvs}
                    fieldsPriority={fieldsPriority}
                    columnCountByTableWidth={columnCountByTableWidth}
                    expandedRowId={expandedRowId}
                    selectedAssetToEdit={selectedAssetToEdit}
                    toggleExpandedRow={toggleExpandedRow}
                    onClickDetails={onClickDetails}
                    setSelectedAssetToEdit={setSelectedAssetToEdit}
                    onCancelEdit={onCancelEdit}
                    onSubmitForm={onSubmitEdit}
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
                        fixedIncomeTypes={mockFixedIncomeTypes}
                        spvs={mockSpvs}
                        onClose={() => setShowNewAssetForm(false)}
                        onCancel={() => setShowNewAssetForm(false)}
                        onSubmitForm={onSubmitCreate}
                        hideNonEditableFields
                    />
                </div>
            )}
        </div>
    );
};
