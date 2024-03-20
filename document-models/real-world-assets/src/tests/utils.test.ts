import {
    Account,
    Asset,
    BaseTransaction,
    FixedIncome,
    RealWorldAssetsState,
    ServiceProviderFeeType,
} from '../..';
import {
    calculatePurchasePrice,
    calculateTotalDiscount,
    computeWeightedAveragePurchaseDate,
    getDifferences,
    validateBaseTransaction,
    validateCashTransaction,
    validateFeeTransaction,
    validateFixedIncomeAsset,
    validateFixedIncomeTransaction,
    validateInterestTransaction,
} from '../utils';

const mockEmptyInitialState = {
    accounts: [],
    principalLenderAccountId: '',
    spvs: [],
    serviceProviderFeeTypes: [],
    fixedIncomeTypes: [],
    portfolio: [],
    transactions: [],
};
const mockEmptyBaseTransaction = {
    id: '',
    assetId: '',
    amount: 0,
    entryTime: new Date().toISOString(),
    accountId: null,
    counterPartyAccountId: null,
    tradeTime: null,
    settlementTime: null,
    txRef: null,
};

const mockFixedIncome: FixedIncome = {
    id: 'mock-id',
    fixedIncomeTypeId: '',
    name: '',
    spvId: '',
    maturity: '',
    purchaseDate: '',
    notional: 0,
    purchasePrice: 0,
    purchaseProceeds: 0,
    salesProceeds: 0,
    totalDiscount: 0,
    ISIN: '',
    CUSIP: '',
    coupon: 0,
    realizedSurplus: 0,
};

describe('validateBaseTransaction', () => {
    test('validateBaseTransaction - should throw error when asset is missing', () => {
        const state = {
            ...mockEmptyInitialState,
            portfolio: [{ id: 'asset1' }] as Asset[],
        };
        const input = {
            ...mockEmptyBaseTransaction,
            id: 'trans1',
            amount: 100,
            entryTime: new Date().toDateString(),
        };
        expect(() => validateBaseTransaction(state, input)).toThrow(
            'Transaction must have an asset',
        );
    });

    test('validateBaseTransaction - should throw error when asset does not exist', () => {
        const state = {
            ...mockEmptyInitialState,
            portfolio: [{ id: 'asset1' }] as Asset[],
        };
        const input = {
            ...mockEmptyBaseTransaction,
            id: 'trans1',
            assetId: 'not-existent-asset',
            amount: 100,
            entryTime: new Date().toDateString(),
        };
        expect(() => validateBaseTransaction(state, input)).toThrow(
            `Asset with id ${input.assetId} does not exist!`,
        );
    });

    test('validateBaseTransaction - should throw error when amount is missing', () => {
        const state = {
            ...mockEmptyInitialState,
            portfolio: [{ id: 'asset1' }] as Asset[],
        };
        const input = {
            ...mockEmptyBaseTransaction,
            id: 'trans1',
            assetId: 'asset1',
            entryTime: new Date().toDateString(),
        };
        expect(() => validateBaseTransaction(state, input)).toThrow(
            'Transaction must have an amount',
        );
    });

    test('validateBaseTransaction - should throw error when entryTime is missing', () => {
        const state = {
            ...mockEmptyInitialState,
            portfolio: [{ id: 'asset1' }] as Asset[],
        };
        const input = {
            ...mockEmptyBaseTransaction,
            id: 'trans1',
            assetId: 'asset1',
            amount: 100,
        };
        // @ts-expect-error mock
        delete input.entryTime;
        expect(() => validateBaseTransaction(state, input)).toThrow(
            'Transaction must have an entry time',
        );
    });

    test('validateBaseTransaction - should throw error when entryTime is not a valid date', () => {
        const state = {
            ...mockEmptyInitialState,
            portfolio: [{ id: 'asset1' }] as Asset[],
        };
        const input = {
            ...mockEmptyBaseTransaction,
            id: 'trans1',
            assetId: 'asset1',
            amount: 100,
            entryTime: 'invalid date',
        };
        expect(() => validateBaseTransaction(state, input)).toThrow(
            'Entry time must be a valid date',
        );
    });

    test('validateBaseTransaction - should throw error when tradeTime is not a valid date', () => {
        const state = {
            ...mockEmptyInitialState,
            portfolio: [{ id: 'asset1' }] as Asset[],
        };
        const input = {
            ...mockEmptyBaseTransaction,
            id: 'trans1',
            assetId: 'asset1',
            amount: 100,
            entryTime: new Date().toDateString(),
            tradeTime: 'invalid date',
        };
        expect(() => validateBaseTransaction(state, input)).toThrow(
            'Trade time must be a valid date',
        );
    });

    test('validateBaseTransaction - should throw error when settlementTime is not a valid date', () => {
        const state = {
            ...mockEmptyInitialState,
            portfolio: [{ id: 'asset1' }] as Asset[],
        };
        const input = {
            ...mockEmptyBaseTransaction,
            id: 'trans1',
            assetId: 'asset1',
            amount: 100,
            entryTime: new Date().toDateString(),
            settlementTime: 'invalid date',
        };
        expect(() => validateBaseTransaction(state, input)).toThrow(
            'Settlement time must be a valid date',
        );
    });

    test('validateBaseTransaction - should throw error when account does not exist', () => {
        const state = {
            ...mockEmptyInitialState,
            portfolio: [{ id: 'asset1' }] as Asset[],
        };
        const input = {
            ...mockEmptyBaseTransaction,
            id: 'trans1',
            assetId: 'asset1',
            amount: 100,
            entryTime: new Date().toDateString(),
            accountId: 'account1',
        };
        expect(() => validateBaseTransaction(state, input)).toThrow(
            `Account with id ${input.accountId} does not exist!`,
        );
    });

    test('validateBaseTransaction - should throw error when counterParty does not exist', () => {
        const state = {
            ...mockEmptyInitialState,
            portfolio: [{ id: 'asset1' }] as Asset[],
        };
        const input = {
            ...mockEmptyBaseTransaction,
            id: 'trans1',
            assetId: 'asset1',
            amount: 100,
            entryTime: new Date().toString(),
            counterPartyAccountId: 'counterParty1',
        };
        expect(() => validateBaseTransaction(state, input)).toThrow(
            `Counter party account with id ${input.counterPartyAccountId} does not exist!`,
        );
    });
});

describe('validateFixedIncomeTransaction', () => {
    it('should throw an error when the asset is not a fixed income asset', () => {
        const state = {
            portfolio: [{ id: '1', spvId: 'equity' }],
        } as RealWorldAssetsState;
        const transaction = {
            assetId: '1',
            amount: 100,
            entryTime: new Date().toISOString(),
        } as BaseTransaction;

        expect(() =>
            validateFixedIncomeTransaction(state, transaction),
        ).toThrow(
            'Fixed income transaction must have a fixed income asset as the asset',
        );
    });

    it('should not throw an error when the asset is a fixed income asset', () => {
        const state = {
            portfolio: [{ id: '1', fixedIncomeTypeId: '1' }],
        } as RealWorldAssetsState;
        const transaction = {
            assetId: '1',
            amount: 100,
            entryTime: new Date().toISOString(),
        } as BaseTransaction;

        expect(() =>
            validateFixedIncomeTransaction(state, transaction),
        ).not.toThrow();
    });
});

describe('validateCashTransaction', () => {
    it('should throw an error when the counterParty is not the principalLender', () => {
        const state = {
            ...mockEmptyInitialState,
            principalLender: 'principalLender1',
            portfolio: [{ id: '1', currency: 'USD' }] as Asset[],
            accounts: [{ id: 'somethingElse' }] as Account[],
            feeTypes: [{ id: 'somethingElse' }] as ServiceProviderFeeType[],
        };
        const transaction = {
            ...mockEmptyBaseTransaction,
            assetId: '1',
            counterPartyAccountId: 'somethingElse',
            amount: 100,
            entryTime: new Date().toISOString(),
        };

        expect(() => validateCashTransaction(state, transaction)).toThrow(
            'Cash transaction must have Maker principal lender as the counter party',
        );
    });

    it('should throw an error when the asset is not a cash asset', () => {
        const state = {
            ...mockEmptyInitialState,
            principalLenderAccountId: 'principalLender1',
            portfolio: [{ id: '1', fixedIncomeTypeId: '1' }] as Asset[],
            accounts: [{ id: 'principalLender1' }] as Account[],
            feeTypes: [{ id: 'principalLender1' }] as ServiceProviderFeeType[],
        };
        const transaction = {
            ...mockEmptyBaseTransaction,
            assetId: '1',
            counterPartyAccountId: 'principalLender1',
            amount: 100,
        };

        expect(() => validateCashTransaction(state, transaction)).toThrow(
            'Cash transaction must have a cash asset as the asset',
        );
    });

    it('should not throw an error when the counterParty is the principalLender and the asset is a cash asset', () => {
        const state = {
            ...mockEmptyInitialState,
            principalLenderAccountId: 'principalLender1',
            portfolio: [{ id: '1', currency: 'USD' }] as Asset[],
            accounts: [{ id: 'principalLender1' }] as Account[],
            feeTypes: [{ id: 'principalLender1' }] as ServiceProviderFeeType[],
        };
        const transaction = {
            ...mockEmptyBaseTransaction,
            assetId: '1',
            counterPartyAccountId: 'principalLender1',
            amount: 100,
        };

        expect(() => validateCashTransaction(state, transaction)).not.toThrow();
    });
});

describe('validateInterestTransaction', () => {
    it('should throw an error when the asset is a cash asset', () => {
        const state = {
            ...mockEmptyInitialState,
            portfolio: [
                { id: '1', spvId: 'serviceProviderFeeType1' },
            ] as Asset[],
            feeTypes: [
                { id: 'serviceProviderFeeType1' },
            ] as ServiceProviderFeeType[],
            accounts: [{ id: 'serviceProviderFeeType1' }] as Account[],
        };
        const transaction = {
            ...mockEmptyBaseTransaction,
            assetId: '1',
            counterPartyAccountId: 'serviceProviderFeeType1',
            amount: 100,
        };

        expect(() => validateInterestTransaction(state, transaction)).toThrow(
            'Interest transaction must have a fixed income asset as the asset',
        );
    });

    it('should throw an error when the counterParty is not provided', () => {
        const state = {
            ...mockEmptyInitialState,
            portfolio: [
                { id: '1', fixedIncomeTypeId: 'fixedIncome' },
            ] as Asset[],
            feeTypes: [
                { id: 'serviceProviderFeeType1' },
            ] as ServiceProviderFeeType[],
        };
        const transaction = {
            ...mockEmptyBaseTransaction,
            assetId: '1',
            amount: 100,
        };

        expect(() => validateInterestTransaction(state, transaction)).toThrow(
            'Interest transaction must have a counter party account',
        );
    });

    it('should throw an error when the counterParty is not a known service provider', () => {
        const state = {
            ...mockEmptyInitialState,
            portfolio: [
                { id: '1', fixedIncomeTypeId: 'fixed_income' },
            ] as Asset[],
            feeTypes: [
                { id: 'serviceProviderFeeType1' },
            ] as ServiceProviderFeeType[],
        };
        const transaction = {
            ...mockEmptyBaseTransaction,
            assetId: '1',
            counterPartyAccountId: 'unknownServiceProviderFeeType',
            amount: 100,
        };

        expect(() => validateInterestTransaction(state, transaction)).toThrow(
            'Counter party account with id unknownServiceProviderFeeType does not exist!',
        );
    });
});

describe('validateFeeTransaction', () => {
    it('should throw an error when the asset is not a fixed income asset', () => {
        const state = {
            ...mockEmptyInitialState,
            portfolio: [{ id: '1', currency: 'USD' }] as Asset[],
            feeTypes: [
                { accountId: 'serviceProviderFeeType1' },
            ] as ServiceProviderFeeType[],
            accounts: [{ id: 'serviceProviderFeeType1' }] as Account[],
        };
        const transaction = {
            ...mockEmptyBaseTransaction,
            assetId: '1',
            counterPartyAccountId: 'serviceProviderFeeType1',
            amount: -100,
        };

        expect(() => validateFeeTransaction(state, transaction)).toThrow(
            'Fee transaction must have a fixed income asset as the asset',
        );
    });

    it('should throw an error when the counterParty is not provided', () => {
        const state = {
            ...mockEmptyInitialState,
            portfolio: [{ id: '1', fixedIncomeTypeId: '1' }] as Asset[],
            feeTypes: [
                { id: 'serviceProviderFeeType1' },
            ] as ServiceProviderFeeType[],
        };
        const transaction = {
            ...mockEmptyBaseTransaction,
            assetId: '1',
            amount: -100,
        };

        expect(() => validateFeeTransaction(state, transaction)).toThrow(
            'Fee transaction must have a counter party account',
        );
    });

    it('should throw an error when the counterParty is not a known service provider', () => {
        const state = {
            ...mockEmptyInitialState,
            portfolio: [{ id: '1', fixedIncomeTypeId: '1' }] as Asset[],
            feeTypes: [
                { accountId: 'serviceProviderFeeType1' },
            ] as ServiceProviderFeeType[],
            accounts: [{ id: 'serviceProviderFeeType1' }] as Account[],
        };
        const transaction = {
            ...mockEmptyBaseTransaction,
            assetId: '1',
            counterPartyAccountId: 'unknownServiceProviderFeeType',
            amount: -100,
        };

        expect(() => validateFeeTransaction(state, transaction)).toThrow(
            'Counter party with id unknownServiceProviderFeeType must be a known service provider',
        );
    });
});
describe('validateFixedIncomeAsset', () => {
    test('should throw error when fixed income type does not exist', () => {
        const state = {
            ...mockEmptyInitialState,
            fixedIncomeTypes: [{ ...mockFixedIncome }],
            spvs: [],
        };
        const asset = {
            ...mockFixedIncome,
            id: 'asset1',
            fixedIncomeTypeId: 'non-existent-type',
        };
        expect(() => validateFixedIncomeAsset(state, asset)).toThrow(
            `Fixed income type with id ${asset.fixedIncomeTypeId} does not exist!`,
        );
    });

    test('should throw error when SPV does not exist', () => {
        const state = {
            ...mockEmptyInitialState,
            fixedIncomeTypes: [],
            spvs: [{ id: 'spv1', name: 'spv1' }],
        };
        const asset = {
            ...mockFixedIncome,
            id: 'asset1',
            spvId: 'non-existent-spv',
        };
        expect(() => validateFixedIncomeAsset(state, asset)).toThrow(
            `SPV with id ${asset.spvId} does not exist!`,
        );
    });

    test('should throw error when maturity is not a valid date', () => {
        const state = {
            ...mockEmptyInitialState,
        };
        const asset = {
            ...mockFixedIncome,
            id: 'asset1',
            maturity: 'invalid date',
        };
        expect(() => validateFixedIncomeAsset(state, asset)).toThrow(
            'Maturity must be a valid date',
        );
    });
});

describe('computeWeightedAveragePurchaseDate', () => {
    it('should correctly compute the weighted average purchase date', () => {
        const transactions: BaseTransaction[] = [
            // @ts-expect-error mock
            { amount: 49133118.05, entryTime: '2023-07-10' },
            // @ts-expect-error mock
            { amount: 24590375, entryTime: '2023-07-14' },
        ];

        const result = computeWeightedAveragePurchaseDate(transactions);
        const expectedDate = new Date('2023-07-11');

        expect(result).toEqual(expectedDate.toISOString());
    });

    it('should return the same date when there is only one transaction', () => {
        const transactions: BaseTransaction[] = [
            // @ts-expect-error mock
            { entryTime: '2022-01-01', amount: 10 },
        ];

        const result = computeWeightedAveragePurchaseDate(transactions);
        const expectedDate = new Date('2022-01-01');

        expect(result).toEqual(expectedDate.toISOString());
    });

    it('should throw an error when the sum of quantity is zero', () => {
        const transactions: BaseTransaction[] = [
            // @ts-expect-error mock
            { entryTime: '2022-01-01', amount: 0 },
            // @ts-expect-error mock
            { entryTime: '2022-02-01', amount: 0 },
        ];

        expect(() => computeWeightedAveragePurchaseDate(transactions)).toThrow(
            'Sum of amount cannot be zero.',
        );
    });

    it('should handle transactions with negative amounts', () => {
        const transactions: BaseTransaction[] = [
            // @ts-expect-error mock
            { entryTime: '2023-01-01', amount: 20000 },
            // @ts-expect-error mock
            { entryTime: '2023-02-15', amount: 30000 },
            // @ts-expect-error mock
            { entryTime: '2023-03-10', amount: -10000 },
        ];

        const result = computeWeightedAveragePurchaseDate(transactions);
        const expectedDate = new Date('2023-01-18');

        expect(result).toEqual(expectedDate.toISOString());
    });
});

describe('calculatePurchasePrice', () => {
    it('should correctly calculate the purchase price for non-zero notional', () => {
        const purchaseProceeds = 100;
        const notional = 20;

        const result = calculatePurchasePrice(purchaseProceeds, notional);
        const expectedPrice = 5;

        expect(result).toEqual(expectedPrice);
    });

    it('should return zero when notional is zero', () => {
        const purchaseProceeds = 100;
        const notional = 0;

        const result = calculatePurchasePrice(purchaseProceeds, notional);
        const expectedPrice = 0;

        expect(result).toEqual(expectedPrice);
    });

    it('should handle negative purchase proceeds', () => {
        const purchaseProceeds = -100;
        const notional = 20;

        const result = calculatePurchasePrice(purchaseProceeds, notional);
        const expectedPrice = -5;

        expect(result).toEqual(expectedPrice);
    });

    it('should handle negative notional', () => {
        const purchaseProceeds = 100;
        const notional = -20;

        const result = calculatePurchasePrice(purchaseProceeds, notional);
        const expectedPrice = -5;

        expect(result).toEqual(expectedPrice);
    });
});

describe('calculateTotalDiscount', () => {
    it('should correctly calculate the total discount for non-zero notional and purchase proceeds', () => {
        const notional = 100;
        const purchaseProceeds = 80;

        const result = calculateTotalDiscount(notional, purchaseProceeds);
        const expectedDiscount = 20;

        expect(result).toEqual(expectedDiscount);
    });

    it('should return notional when purchase proceeds is zero', () => {
        const notional = 100;
        const purchaseProceeds = 0;

        const result = calculateTotalDiscount(notional, purchaseProceeds);
        const expectedDiscount = 100;

        expect(result).toEqual(expectedDiscount);
    });

    it('should return zero when notional and purchase proceeds are equal', () => {
        const notional = 100;
        const purchaseProceeds = 100;

        const result = calculateTotalDiscount(notional, purchaseProceeds);
        const expectedDiscount = 0;

        expect(result).toEqual(expectedDiscount);
    });

    it('should handle negative notional and purchase proceeds', () => {
        const notional = -100;
        const purchaseProceeds = -80;

        const result = calculateTotalDiscount(notional, purchaseProceeds);
        const expectedDiscount = -20;

        expect(result).toEqual(expectedDiscount);
    });
});

describe('getDifferences', () => {
    it('should detect changes in primitive fields', () => {
        const obj1 = { name: 'Alice', age: 30 };
        const obj2 = { name: 'Bob', age: 30 };
        expect(getDifferences(obj1, obj2)).toEqual({ name: 'Bob' });
    });

    it('should detect changes in nested objects', () => {
        const obj1 = {
            name: 'Alice',
            address: { city: 'Townsville', street: '123 Main St' },
        };
        const obj2 = {
            name: 'Alice',
            address: { city: 'Elsewhere', street: '123 Main St' },
        };
        expect(getDifferences(obj1, obj2)).toEqual({
            address: { city: 'Elsewhere', street: '123 Main St' },
        });
    });

    it('should return {} if there are no differences', () => {
        const obj1 = { name: 'Alice', age: 30 };
        const obj2 = { name: 'Alice', age: 30 };
        expect(getDifferences(obj1, obj2)).toEqual({});
    });

    it('should detect additions and deletions in objects', () => {
        const obj1 = { name: 'Alice' };
        const obj2 = { name: 'Alice', age: 31 }; // Age added
        const obj3 = { age: 31 }; // Name removed
        expect(getDifferences(obj1, obj2)).toEqual({ age: 31 });
        // @ts-expect-error mock
        expect(getDifferences(obj1, obj3)).toEqual({
            name: undefined,
            age: 31,
        });
    });

    // Test for detecting changes within arrays of objects
    it('should return the entire new array if any element has changed', () => {
        const obj1 = {
            users: [
                { id: 1, name: 'Alice' },
                { id: 2, name: 'Bob' },
            ],
        };
        const obj2 = {
            users: [
                { id: 1, name: 'Alice' },
                { id: 2, name: 'Robert' },
            ],
        };
        expect(getDifferences(obj1, obj2)).toEqual({ users: obj2.users });
    });

    // Test for no changes in arrays
    it('should not return the array if there are no changes', () => {
        const obj1 = { hobbies: ['reading', 'gardening'] };
        const obj2 = { hobbies: ['reading', 'gardening'] };
        expect(getDifferences(obj1, obj2)).toEqual({});
    });
});
