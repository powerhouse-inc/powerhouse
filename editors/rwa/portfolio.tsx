import { AssetsTableProps, PortfolioTab } from '@powerhousedao/design-system';
import { copy } from 'copy-anything';
import { utils } from 'document-model/document';
import { useCallback } from 'react';
import {
    FixedIncome,
    actions,
    calculateCurrentValue,
    getDifferences,
} from '../../document-models/real-world-assets';
import { IProps } from './editor';

export const Portfolio = (props: IProps) => {
    const {
        dispatch,
        document,
        isAllowedToCreateDocuments,
        isAllowedToEditDocuments,
    } = props;

    const state = document.state.global;
    const { transactions, fixedIncomeTypes } = state;

    const onSubmitEdit: AssetsTableProps['onSubmitEdit'] = useCallback(
        data => {
            const selectedItem = state.portfolio.find(f => f.id === data.id) as
                | FixedIncome
                | undefined;
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
                return;
            }

            dispatch(
                actions.editFixedIncomeAsset({
                    ...changedFields,
                    id: selectedItem.id,
                }),
            );
        },
        [dispatch, state.portfolio],
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
        },
        [dispatch],
    );

    const onSubmitDelete: AssetsTableProps['onSubmitDelete'] = useCallback(
        (id: string) => {
            dispatch(actions.deleteFixedIncomeAsset({ id }));
        },
        [dispatch],
    );

    const onSubmitCreateFixedIncomeType: AssetsTableProps['onSubmitCreateFixedIncomeType'] =
        useCallback(
            data => {
                const id = utils.hashKey();
                const name = data.name;

                if (!name) throw new Error('Name is required');

                dispatch(actions.createFixedIncomeType({ id, name }));
            },
            [dispatch],
        );

    const onSubmitCreateSpv: AssetsTableProps['onSubmitCreateSpv'] =
        useCallback(
            data => {
                const id = utils.hashKey();
                const name = data.name;

                if (!name) throw new Error('Name is required');

                dispatch(
                    actions.createSpv({
                        id,
                        name,
                    }),
                );
            },
            [dispatch],
        );

    const calculateCurrentValueCallback: AssetsTableProps['calculateCurrentValueCallback'] =
        useCallback(
            (asset: FixedIncome, currentDate?: Date) =>
                calculateCurrentValue({
                    asset,
                    transactions,
                    fixedIncomeTypes,
                    currentDate,
                }),
            [fixedIncomeTypes, transactions],
        );

    return (
        <PortfolioTab
            state={state}
            isAllowedToCreateDocuments={isAllowedToCreateDocuments}
            isAllowedToEditDocuments={isAllowedToEditDocuments}
            onSubmitEdit={onSubmitEdit}
            onSubmitCreate={onSubmitCreate}
            onSubmitDelete={onSubmitDelete}
            onSubmitCreateFixedIncomeType={onSubmitCreateFixedIncomeType}
            onSubmitCreateSpv={onSubmitCreateSpv}
            calculateCurrentValueCallback={calculateCurrentValueCallback}
        />
    );
};
