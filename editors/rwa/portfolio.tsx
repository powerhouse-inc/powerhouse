import {
    AssetFormInputs,
    AssetsTable,
    AssetsTableProps,
    FixedIncome as UiFixedIncome,
} from '@powerhousedao/design-system';
import { utils } from 'document-model/document';
import { useCallback, useState } from 'react';
import {
    FixedIncome,
    actions,
    getDifferences,
    isFixedIncomeAsset,
} from '../../document-models/real-world-assets';
import { IProps } from './editor';

function createAssetFromFormInputs(data: AssetFormInputs) {
    const maturity = new Date(data.maturity).toISOString();
    return {
        ...data,
        maturity,
    };
}

export const Portfolio = (props: IProps) => {
    const [expandedRowId, setExpandedRowId] = useState<string>();
    const [selectedItem, setSelectedItem] = useState<UiFixedIncome>();
    const [showNewItemForm, setShowNewItemForm] = useState(false);

    const { dispatch, document } = props;

    const spvs = document.state.global.spvs;

    const fixedIncomeTypes = document.state.global.fixedIncomeTypes;

    const portfolio = document.state.global.portfolio.filter(
        (asset): asset is FixedIncome => isFixedIncomeAsset(asset),
    );

    const toggleExpandedRow = useCallback(
        (id: string | undefined) => {
            setExpandedRowId(curr =>
                curr && curr === expandedRowId ? undefined : id,
            );
        },
        [expandedRowId],
    );

    const onSubmitEdit: AssetsTableProps['onSubmitEdit'] = useCallback(
        data => {
            if (!selectedItem) return;
            const asset = createAssetFromFormInputs(data);
            const changedFields = getDifferences(selectedItem, asset);

            if (Object.values(changedFields).filter(Boolean).length === 0) {
                setSelectedItem(undefined);
                return;
            }

            dispatch(
                actions.editFixedIncomeAsset({
                    ...changedFields,
                    id: selectedItem.id,
                }),
            );
            setSelectedItem(undefined);
        },
        [dispatch, selectedItem],
    );

    const onSubmitCreate: AssetsTableProps['onSubmitCreate'] = useCallback(
        data => {
            const asset = createAssetFromFormInputs(data);
            dispatch(
                actions.createFixedIncomeAsset({
                    ...asset,
                    id: utils.hashKey(),
                }),
            );
            setShowNewItemForm(false);
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
            <AssetsTable
                assets={portfolio as UiFixedIncome[]}
                fixedIncomeTypes={fixedIncomeTypes}
                spvs={spvs}
                expandedRowId={expandedRowId}
                selectedItem={selectedItem}
                showNewItemForm={showNewItemForm}
                toggleExpandedRow={toggleExpandedRow}
                setSelectedItem={setSelectedItem}
                setShowNewItemForm={setShowNewItemForm}
                onSubmitEdit={onSubmitEdit}
                onSubmitCreate={onSubmitCreate}
            />
        </div>
    );
};
