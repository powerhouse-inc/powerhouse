import { copy } from 'copy-anything';
import {
    calculateCurrentValue,
    computeFixedIncomeAssetDerivedFields,
    getGroupTransactionsForAsset,
    isFixedIncomeAsset,
    validateFixedIncomeAssetDerivedFields,
} from '.';
import { RealWorldAssetsDocument, RealWorldAssetsState } from '../..';

export function makeFixedIncomeAssetWithDerivedFields(
    state: RealWorldAssetsState,
    assetId: string,
) {
    const asset = state.portfolio.find((a) => a.id === assetId);
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

export function makeRwaDocumentWithAssetCurrentValues(
    document: RealWorldAssetsDocument,
    currentDate = new Date(),
) {
    const documentCopy = copy(document);
    const transactions = documentCopy.state.global.transactions;
    const fixedIncomeTypes = documentCopy.state.global.fixedIncomeTypes;
    const portfolio = documentCopy.state.global.portfolio;

    const portfolioWithCurrentValues = portfolio.map((asset) => ({
        ...asset,
        ...(isFixedIncomeAsset(asset) && {
            currentValue: calculateCurrentValue({
                asset,
                transactions,
                fixedIncomeTypes,
                currentDate,
            }),
        }),
    }));

    documentCopy.state.global.portfolio = portfolioWithCurrentValues;

    return documentCopy;
}
