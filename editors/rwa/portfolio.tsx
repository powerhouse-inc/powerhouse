import {
    AssetsTable,
    AssetsTableProps,
    FixedIncome as UiFixedIncome,
} from '@powerhousedao/design-system';
import { copy } from 'copy-anything';
import { utils } from 'document-model/document';
import { useCallback, useState } from 'react';
import {
    FixedIncome,
    actions,
    getDifferences,
    isFixedIncomeAsset,
} from '../../document-models/real-world-assets';
import { IProps } from './editor';

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
            const update = copy(selectedItem);
            const newName = data.name;
            const newMaturity = data.maturity
                ? new Date(data.maturity).toISOString()
                : undefined;
            const fixedIncomeTypeId = data.fixedIncomeTypeId;
            const newSpvId = data.spvId;
            const newCUSIP = data.CUSIP;
            const newISIN = data.ISIN;
            const newCoupon = data.coupon;

            if (newName) update.name = newName;
            if (newMaturity) update.maturity = newMaturity;
            if (fixedIncomeTypeId) update.fixedIncomeTypeId = fixedIncomeTypeId;
            if (newSpvId) update.spvId = newSpvId;
            if (newCUSIP) update.CUSIP = newCUSIP;
            if (newISIN) update.ISIN = newISIN;
            if (newCoupon) update.coupon = newCoupon;

            const changedFields = getDifferences(selectedItem, update);

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
            const id = utils.hashKey();
            const name = data.name;
            const maturity = data.maturity
                ? new Date(data.maturity).toISOString()
                : undefined;
            const fixedIncomeTypeId = data.fixedIncomeTypeId;
            const spvId = data.spvId;
            const CUSIP = data.CUSIP;
            const ISIN = data.ISIN;
            const coupon = data.coupon;

            if (!name) throw new Error('Name is required');
            if (!maturity) throw new Error('Maturity is required');
            if (!fixedIncomeTypeId)
                throw new Error('Fixed income type is required');
            if (!spvId) throw new Error('SPV is required');

            dispatch(
                actions.createFixedIncomeAsset({
                    id,
                    name,
                    maturity,
                    fixedIncomeTypeId,
                    spvId,
                    CUSIP,
                    ISIN,
                    coupon,
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
