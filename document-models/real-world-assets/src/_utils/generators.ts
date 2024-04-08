import {
    computeFixedIncomeAssetDerivedFields,
    getGroupTransactionsForAsset,
    validateFixedIncomeAssetDerivedFields,
} from '.';
import { RealWorldAssetsState } from '../..';

export function makeFixedIncomeAssetWithDerivedFields(
    state: RealWorldAssetsState,
    assetId: string,
) {
    const asset = state.portfolio.find(a => a.id === assetId);
    if (!asset) {
        throw new Error(`Asset with id ${assetId} does not exist!`);
    }

    const transactions = getGroupTransactionsForAsset(state, assetId);

    const derivedFields = computeFixedIncomeAssetDerivedFields(transactions);

    validateFixedIncomeAssetDerivedFields(derivedFields);
    const newAsset = {
        ...asset,
        ...derivedFields,
    };

    return newAsset;
}
