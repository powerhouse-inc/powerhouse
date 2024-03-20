/**
 * This is a scaffold file meant for customization:
 * - modify it by implementing the reducer functions
 * - delete the file and run the code generator again to have it reset
 */

import { Asset, FixedIncome, validateFixedIncomeAsset } from '../..';
import { RealWorldAssetsPortfolioOperations } from '../../gen/portfolio/operations';

export const reducer: RealWorldAssetsPortfolioOperations = {
    createFixedIncomeTypeOperation(state, action, dispatch) {
        if (!action.input.id) {
            throw new Error(`Fixed income type must have an id`);
        }
        if (!action.input.name) {
            throw new Error(`Fixed income type must have a name`);
        }
        if (state.fixedIncomeTypes.find(type => type.id === action.input.id)) {
            throw new Error(`Type with id ${action.input.id} already exists!`);
        }
        state.fixedIncomeTypes.push(action.input);
    },
    editFixedIncomeTypeOperation(state, action, dispatch) {
        if (!action.input.id) {
            throw new Error(`Fixed income type must have an id`);
        }
        const type = state.fixedIncomeTypes.find(
            type => type.id === action.input.id,
        );
        if (!type) {
            throw new Error(`Type with id ${action.input.id} does not exist!`);
        }
        state.fixedIncomeTypes = state.fixedIncomeTypes.map(type =>
            type.id === action.input.id
                ? {
                      ...type,
                      name: action.input.name ?? type.name,
                  }
                : type,
        );
    },
    createFixedIncomeAssetOperation(state, action, dispatch) {
        if (!action.input.id) {
            throw new Error(`Fixed income asset must have an id`);
        }
        if (state.portfolio.find(asset => asset.id === action.input.id)) {
            throw new Error(`Asset with id ${action.input.id} already exists!`);
        }
        if (!action.input.fixedIncomeTypeId) {
            throw new Error(`Fixed income asset must have a type`);
        }
        if (!action.input.name) {
            throw new Error(`Fixed income asset must have a name`);
        }
        if (!action.input.spvId) {
            throw new Error(`Fixed income asset must have an SPV`);
        }
        if (!action.input.maturity) {
            throw new Error(`Fixed income asset must have a maturity`);
        }
        validateFixedIncomeAsset(state, action.input as FixedIncome);
        const asset = {
            ...action.input,
            ISIN: action.input.ISIN ?? null,
            CUSIP: action.input.CUSIP ?? null,
            coupon: action.input.coupon ?? null,
            // the following values are all derived from underlying fixed income transactions
            // and are set to 0 by default
            purchasePrice: 0,
            totalDiscount: 0,
            notional: 0,
            purchaseDate: '',
            purchaseProceeds: 0,
            salesProceeds: 0,
            realizedSurplus: 0,
        };
        state.portfolio.push(asset);
    },
    createCashAssetOperation(state, action, dispatch) {
        if (!action.input.id) {
            throw new Error(`Cash asset must have an id`);
        }
        if (!action.input.spvId) {
            throw new Error(`Cash asset must have a spv`);
        }
        if (!action.input.currency) {
            throw new Error(`Cash asset must have a currency`);
        }
        if (!action.input.balance) {
            throw new Error(`Cash asset must have a balance`);
        }
        if (!state.spvs.find(spv => spv.id === action.input.spvId)) {
            throw new Error(`SPV with id ${action.input.id} does not exist!`);
        }
        if (action.input.currency !== 'USD') {
            // todo: add support for other currencies
            throw new Error('Only USD currency is supported');
        }
        if (state.portfolio.find(asset => asset.id === action.input.id)) {
            throw new Error(`Asset with id ${action.input.id} already exists!`);
        }
        state.portfolio.push(action.input as Asset);
    },
    editFixedIncomeAssetOperation(state, action, dispatch) {
        if (!action.input.id) {
            throw new Error(`Fixed income asset must have an id`);
        }
        const asset = state.portfolio.find(
            asset => asset.id === action.input.id,
        );
        if (!asset) {
            throw new Error(`Asset with id ${action.input.id} does not exist!`);
        }
        validateFixedIncomeAsset(state, action.input as FixedIncome);
        state.portfolio = state.portfolio.map(asset =>
            asset.id === action.input.id
                ? ({
                      ...asset,
                      ...action.input,
                  } as FixedIncome)
                : asset,
        );
    },
    editCashAssetOperation(state, action, dispatch) {
        if (!action.input.id) {
            throw new Error(`Cash asset must have an id`);
        }
        const asset = state.portfolio.find(
            asset => asset.id === action.input.id,
        );
        if (!asset) {
            throw new Error(`Asset with id ${action.input.id} does not exist!`);
        }
        if (
            action.input.spvId &&
            !state.spvs.find(spv => spv.id === action.input.spvId)
        ) {
            throw new Error(`SPV with id ${action.input.id} does not exist!`);
        }
        if (action.input.currency && action.input.currency !== 'USD') {
            // todo: add support for other currencies
            throw new Error('Only USD currency is supported');
        }
        state.portfolio = state.portfolio.map(asset =>
            asset.id === action.input.id
                ? ({
                      ...asset,
                      ...action.input,
                  } as Asset)
                : asset,
        );
    },
    deleteFixedIncomeAssetOperation(state, action, dispatch) {
        if (!action.input.id) {
            throw new Error(`Fixed income asset must have an id`);
        }
        const asset = state.portfolio.find(
            asset => asset.id === action.input.id,
        );
        if (!asset) {
            throw new Error(`Asset with id ${action.input.id} does not exist!`);
        }
        state.portfolio = state.portfolio.filter(
            asset => asset.id !== action.input.id,
        );
    },
    deleteCashAssetOperation(state, action, dispatch) {
        if (!action.input.id) {
            throw new Error(`Fixed income asset must have an id`);
        }
        const asset = state.portfolio.find(
            asset => asset.id === action.input.id,
        );
        if (!asset) {
            throw new Error(`Asset with id ${action.input.id} does not exist!`);
        }
        state.portfolio = state.portfolio.filter(
            asset => asset.id !== action.input.id,
        );
    },
};
