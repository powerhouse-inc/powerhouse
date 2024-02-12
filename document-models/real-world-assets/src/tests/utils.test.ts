import {
    Account,
    Asset,
    AssetPurchaseGroupTransaction,
    AssetSaleGroupTransaction,
    BaseTransaction,
    FeesPaymentGroupTransaction,
    FixedIncome,
    GroupTransaction,
    InterestReturnGroupTransaction,
    PrincipalDrawGroupTransaction,
    PrincipalReturnGroupTransaction,
    RealWorldAssetsState,
    ServiceProvider,
} from '../..';
import {
    calculateAnnualizedYield,
    calculateNotional,
    calculatePurchasePrice,
    calculatePurchaseProceeds,
    calculateTotalDiscount,
    computeWeightedAveragePurchaseDate,
    validateBaseTransaction,
    validateCashTransaction,
    validateFeeTransaction,
    validateFixedIncomeAsset,
    validateFixedIncomeTransaction,
    validateHasCorrectTransactions,
    validateInterestTransaction,
} from '../utils';

const mockEmptyInitialState = {
    accounts: [],
    principalLenderAccountId: '',
    spvs: [],
    feeTypes: [],
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
    totalDiscount: 0,
    annualizedYield: 0,
    ISIN: '',
    CUSIP: '',
    coupon: 0,
};

describe('validateBaseTransaction', () => {
    test('validateBaseTransaction - should throw error when id is missing', () => {
        const state = {
            ...mockEmptyInitialState,
            portfolio: [{ id: 'asset1' } as Asset],
        };
        const input = {
            ...mockEmptyBaseTransaction,
            assetId: 'asset1',
            amount: 100,
            entryTime: new Date().toISOString(),
        };
        expect(() => validateBaseTransaction(state, input)).toThrow(
            'Transaction must have an id',
        );
    });

    test('validateBaseTransaction - should throw error when transaction id already exists', () => {
        const state = {
            ...mockEmptyInitialState,
            transactions: [{ id: 'trans1' }] as GroupTransaction[],
            portfolio: [{ id: 'asset1' }] as Asset[],
        };
        const input = {
            ...mockEmptyBaseTransaction,
            id: 'trans1',
            assetId: 'asset1',
            amount: 100,
            entryTime: new Date().toString(),
        };
        expect(() => validateBaseTransaction(state, input)).toThrow(
            `Transaction with id ${input.id} already exists!`,
        );
    });

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

describe('validateHasCorrectTransactions', () => {
    // Test cases for PrincipalDraw
    it('should allow cashTransaction and feeTransactions for PrincipalDraw', () => {
        const input = {
            cashTransaction: {},
            feeTransactions: [{}],
        } as PrincipalDrawGroupTransaction;
        expect(() =>
            validateHasCorrectTransactions('PrincipalDraw', input),
        ).not.toThrow();
    });

    it('should not allow other transactions for PrincipalDraw', () => {
        const transactionTypes = [
            'fixedIncomeTransaction',
            'interestTransaction',
        ];
        transactionTypes.forEach(tx => {
            const input = {
                [tx]: {},
            };
            expect(() =>
                validateHasCorrectTransactions('PrincipalDraw', input),
            ).toThrow();
        });
    });

    // Test cases for PrincipalReturn
    it('should allow cashTransaction and feeTransactions for PrincipalReturn', () => {
        const input = {
            cashTransaction: {},
            feeTransactions: [{}],
        } as PrincipalReturnGroupTransaction;
        expect(() =>
            validateHasCorrectTransactions('PrincipalReturn', input),
        ).not.toThrow();
    });

    it('should not allow other transactions for PrincipalReturn', () => {
        const transactionTypes = [
            'fixedIncomeTransaction',
            'interestTransaction',
        ];
        transactionTypes.forEach(tx => {
            const input = {
                [tx]: {},
            };
            expect(() =>
                validateHasCorrectTransactions('PrincipalReturn', input),
            ).toThrow();
        });
    });

    // Test cases for AssetPurchase
    it('should allow fixedIncomeTransaction, cashTransaction and feeTransactions for AssetPurchase', () => {
        const input = {
            fixedIncomeTransaction: {},
            cashTransaction: {},
            feeTransactions: [{}],
        } as AssetPurchaseGroupTransaction;
        expect(() =>
            validateHasCorrectTransactions('AssetPurchase', input),
        ).not.toThrow();
    });

    it('should not allow other transactions for AssetPurchase', () => {
        const transactionTypes = ['interestTransaction'];
        transactionTypes.forEach(tx => {
            const input = {
                [tx]: {},
            };
            expect(() =>
                validateHasCorrectTransactions('AssetPurchase', input),
            ).toThrow();
        });
    });

    // Test cases for AssetSale
    it('should allow fixedIncomeTransaction, cashTransaction and feeTransactions for AssetSale', () => {
        const input = {
            fixedIncomeTransaction: {},
            cashTransaction: {},
            feeTransactions: [{}],
        } as AssetSaleGroupTransaction;
        expect(() =>
            validateHasCorrectTransactions('AssetSale', input),
        ).not.toThrow();
    });

    it('should not allow other transactions for AssetSale', () => {
        const transactionTypes = ['interestTransaction'];
        transactionTypes.forEach(tx => {
            const input = {
                [tx]: {},
            };
            expect(() =>
                validateHasCorrectTransactions('AssetSale', input),
            ).toThrow();
        });
    });

    // Test cases for InterestDraw
    it('should allow interestTransaction for InterestDraw', () => {
        const input = {
            interestTransaction: {},
        } as InterestReturnGroupTransaction;
        expect(() =>
            validateHasCorrectTransactions('InterestDraw', input),
        ).not.toThrow();
    });

    it('should not allow other transactions for InterestDraw', () => {
        const transactionTypes = [
            'cashTransaction',
            'fixedIncomeTransaction',
            'feeTransactions',
        ];
        transactionTypes.forEach(tx => {
            const input = {
                [tx]: {},
            };
            expect(() =>
                validateHasCorrectTransactions('InterestDraw', input),
            ).toThrow();
        });
    });

    // Test cases for InterestReturn
    it('should allow interestTransaction for InterestReturn', () => {
        const input = {
            interestTransaction: {},
        } as InterestReturnGroupTransaction;
        expect(() =>
            validateHasCorrectTransactions('InterestReturn', input),
        ).not.toThrow();
    });

    it('should not allow other transactions for InterestReturn', () => {
        const transactionTypes = [
            'cashTransaction',
            'fixedIncomeTransaction',
            'feeTransactions',
        ];
        transactionTypes.forEach(tx => {
            const input = {
                [tx]: {},
            };
            expect(() =>
                validateHasCorrectTransactions('InterestReturn', input),
            ).toThrow();
        });
    });

    // Test cases for FeesPayment
    it('should allow feeTransactions for FeesPayment', () => {
        const input = {
            feeTransactions: [{}],
        } as FeesPaymentGroupTransaction;
        expect(() =>
            validateHasCorrectTransactions('FeesPayment', input),
        ).not.toThrow();
    });

    it('should not allow other transactions for FeesPayment', () => {
        const transactionTypes = [
            'cashTransaction',
            'fixedIncomeTransaction',
            'interestTransaction',
        ];
        transactionTypes.forEach(tx => {
            const input = {
                [tx]: {},
            };
            expect(() =>
                validateHasCorrectTransactions('FeesPayment', input),
            ).toThrow();
        });
    });
});

describe('validateFixedIncomeTransaction', () => {
    it('should throw an error when the asset is not a fixed income asset', () => {
        const state = {
            portfolio: [{ id: '1', spvId: 'equity' }],
        } as RealWorldAssetsState;
        const transaction = { assetId: '1' } as BaseTransaction;

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
        const transaction = { assetId: '1' } as BaseTransaction;

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
        };
        const transaction = {
            ...mockEmptyBaseTransaction,
            assetId: '1',
            counterPartyAccountId: 'counterParty1',
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
        };
        const transaction = {
            ...mockEmptyBaseTransaction,
            assetId: '1',
            counterPartyAccountId: 'principalLender1',
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
        };
        const transaction = {
            ...mockEmptyBaseTransaction,
            assetId: '1',
            counterPartyAccountId: 'principalLender1',
        };

        expect(() => validateCashTransaction(state, transaction)).not.toThrow();
    });
});

describe('validateInterestTransaction', () => {
    it('should throw an error when the asset is a cash asset', () => {
        const state = {
            ...mockEmptyInitialState,
            portfolio: [{ id: '1', spvId: 'serviceProvider1' }] as Asset[],
            feeTypes: [{ id: 'serviceProvider1' }] as ServiceProvider[],
            accounts: [{ id: 'serviceProvider1' }] as Account[],
        };
        const transaction = {
            ...mockEmptyBaseTransaction,
            assetId: '1',
            counterPartyAccountId: 'serviceProvider1',
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
            feeTypes: [{ id: 'serviceProvider1' }] as ServiceProvider[],
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
            feeTypes: [{ id: 'serviceProvider1' }] as ServiceProvider[],
        };
        const transaction = {
            ...mockEmptyBaseTransaction,
            assetId: '1',
            counterPartyAccountId: 'unknownServiceProvider',
            amount: 100,
        };

        expect(() => validateInterestTransaction(state, transaction)).toThrow(
            'Counter party with id unknownServiceProvider must be a known service provider',
        );
    });

    it('should throw an error when the amount is not positive', () => {
        const state = {
            ...mockEmptyInitialState,
            portfolio: [
                { id: '1', fixedIncomeTypeId: 'fixed_income' },
            ] as Asset[],
            feeTypes: [{ accountId: 'serviceProvider1' }] as ServiceProvider[],
            accounts: [{ id: 'serviceProvider1' }] as Account[],
        };
        const transaction = {
            ...mockEmptyBaseTransaction,
            assetId: '1',
            counterPartyAccountId: 'serviceProvider1',
            amount: -100,
        };

        expect(() => validateInterestTransaction(state, transaction)).toThrow(
            'Interest transaction amount must be positive',
        );
    });

    it('should not throw an error when the asset is not a cash asset, the counterParty is provided and is a known service provider, and the amount is positive', () => {
        const state = {
            ...mockEmptyInitialState,
            portfolio: [
                { id: '1', fixedIncomeTypeId: 'fixed_income' },
            ] as Asset[],
            feeTypes: [{ accountId: 'serviceProvider1' }] as ServiceProvider[],
            accounts: [{ id: 'serviceProvider1' }] as Account[],
        };
        const transaction = {
            ...mockEmptyBaseTransaction,
            assetId: '1',
            counterPartyAccountId: 'serviceProvider1',
            amount: 100,
        };

        expect(() =>
            validateInterestTransaction(state, transaction),
        ).not.toThrow();
    });
});

describe('validateFeeTransaction', () => {
    it('should throw an error when the asset is not a fixed income asset', () => {
        const state = {
            ...mockEmptyInitialState,
            portfolio: [{ id: '1', currency: 'USD' }] as Asset[],
            feeTypes: [{ accountId: 'serviceProvider1' }] as ServiceProvider[],
            accounts: [{ id: 'serviceProvider1' }] as Account[],
        };
        const transaction = {
            ...mockEmptyBaseTransaction,
            assetId: '1',
            counterPartyAccountId: 'serviceProvider1',
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
            feeTypes: [{ id: 'serviceProvider1' }] as ServiceProvider[],
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
            feeTypes: [{ accountId: 'serviceProvider1' }] as ServiceProvider[],
            accounts: [{ id: 'serviceProvider1' }] as Account[],
        };
        const transaction = {
            ...mockEmptyBaseTransaction,
            assetId: '1',
            counterPartyAccountId: 'unknownServiceProvider',
            amount: -100,
        };

        expect(() => validateFeeTransaction(state, transaction)).toThrow(
            'Counter party with id unknownServiceProvider must be a known service provider',
        );
    });

    it('should throw an error when the amount is not negative', () => {
        const state = {
            ...mockEmptyInitialState,
            portfolio: [{ id: '1', fixedIncomeTypeId: '1' }] as Asset[],
            feeTypes: [{ accountId: 'serviceProvider1' }] as ServiceProvider[],
            accounts: [{ id: 'serviceProvider1' }] as Account[],
        };
        const transaction = {
            ...mockEmptyBaseTransaction,
            assetId: '1',
            counterPartyAccountId: 'serviceProvider1',
            amount: 100,
        };

        expect(() => validateFeeTransaction(state, transaction)).toThrow(
            'Fee transaction amount must be negative',
        );
    });

    it('should not throw an error when the asset is a cash asset, the counterParty is provided and is a known service provider, and the amount is negative', () => {
        const state = {
            ...mockEmptyInitialState,
            portfolio: [{ id: '1', fixedIncomeTypeId: '1' }] as Asset[],
            feeTypes: [{ accountId: 'serviceProvider1' }] as ServiceProvider[],
            accounts: [{ id: 'serviceProvider1' }] as Account[],
        };
        const transaction = {
            ...mockEmptyBaseTransaction,
            assetId: '1',
            counterPartyAccountId: 'serviceProvider1',
            amount: -100,
        };

        expect(() => validateFeeTransaction(state, transaction)).not.toThrow();
    });
});
describe('validateFixedIncomeAsset', () => {
    test('should throw error when asset is not a fixed income asset', () => {
        const state = {
            ...mockEmptyInitialState,
            fixedIncomeTypes: [],
            spvs: [],
        };
        const asset = {
            currency: 'USD',
            id: 'asset1',
        };
        // @ts-expect-error mock
        expect(() => validateFixedIncomeAsset(state, asset)).toThrow(
            `Asset with id ${asset.id} does not exist!`,
        );
    });

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

describe('calculateNotional', () => {
    it('should correctly calculate the notional for multiple transactions', () => {
        const transactions: BaseTransaction[] = [
            // @ts-expect-error mock
            { entryTime: '2022-01-01', amount: 10 },
            // @ts-expect-error mock
            { entryTime: '2022-02-01', amount: 20 },
            // @ts-expect-error mock
            { entryTime: '2022-03-01', amount: 30 },
        ];

        const result = calculateNotional(transactions);
        const expectedNotional = 60;

        expect(result).toEqual(expectedNotional);
    });

    it('should return zero when there are no transactions', () => {
        const transactions: BaseTransaction[] = [];

        const result = calculateNotional(transactions);
        const expectedNotional = 0;

        expect(result).toEqual(expectedNotional);
    });

    it('should handle transactions with negative amounts', () => {
        const transactions: BaseTransaction[] = [
            // @ts-expect-error mock
            { entryTime: '2022-01-01', amount: 10 },
            // @ts-expect-error mock
            { entryTime: '2022-02-01', amount: -20 },
            // @ts-expect-error mock
            { entryTime: '2022-03-01', amount: 30 },
        ];

        const result = calculateNotional(transactions);
        const expectedNotional = 20;

        expect(result).toEqual(expectedNotional);
    });
});

describe('calculatePurchaseProceeds', () => {
    it('should correctly calculate the purchase proceeds for multiple transactions', () => {
        const transactions: BaseTransaction[] = [
            // @ts-expect-error mock
            { entryTime: '2022-01-01', amount: 10 },
            // @ts-expect-error mock
            { entryTime: '2022-02-01', amount: 20 },
            // @ts-expect-error mock
            { entryTime: '2022-03-01', amount: 30 },
        ];

        const result = calculatePurchaseProceeds(transactions);
        const expectedProceeds = 60;

        expect(result).toEqual(expectedProceeds);
    });

    it('should return zero when there are no transactions', () => {
        const transactions: BaseTransaction[] = [];

        const result = calculatePurchaseProceeds(transactions);
        const expectedProceeds = 0;

        expect(result).toEqual(expectedProceeds);
    });

    it('should handle transactions with negative amounts', () => {
        const transactions: BaseTransaction[] = [
            // @ts-expect-error mock
            { entryTime: '2022-01-01', amount: 10 },
            // @ts-expect-error mock
            { entryTime: '2022-02-01', amount: -20 },
            // @ts-expect-error mock
            { entryTime: '2022-03-01', amount: 30 },
        ];

        const result = calculatePurchaseProceeds(transactions);
        const expectedProceeds = 20;

        expect(result).toEqual(expectedProceeds);
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

describe('calculateAnnualizedYield', () => {
    it('should correctly calculate the annualized yield for valid inputs', () => {
        const purchasePrice = 100;
        const notional = 200;
        const maturity = new Date(
            new Date().getTime() + 1000 * 60 * 60 * 24 * 365,
        ).toISOString();
        const result = calculateAnnualizedYield(
            purchasePrice,
            notional,
            maturity,
        );
        const expectedYield = 100; // Expected yield is 100%

        expect(Math.round(result)).toEqual(expectedYield);
    });

    it('should throw an error when maturity date is in the past', () => {
        const purchasePrice = 100;
        const notional = 200;
        const maturity = new Date(
            new Date().getTime() - 1000 * 60 * 60 * 24 * 365,
        ).toISOString();

        expect(() =>
            calculateAnnualizedYield(purchasePrice, notional, maturity),
        ).toThrow('Maturity date must be in the future.');
    });

    it('should throw an error when notional is equal to purchase price', () => {
        const purchasePrice = 100;
        const notional = 100;
        const maturity = new Date(
            new Date().getTime() + 1000 * 60 * 60 * 24 * 365,
        ).toISOString();

        expect(() =>
            calculateAnnualizedYield(purchasePrice, notional, maturity),
        ).toThrow('Notional must be greater than purchase price.');
    });

    it('should handle edge case where maturity date is today', () => {
        const purchasePrice = 100;
        const notional = 200;
        const maturity = new Date().toISOString();

        const result = calculateAnnualizedYield(
            purchasePrice,
            notional,
            maturity,
        );
        const expectedYield = 0; // Expected yield is 0%

        expect(result).toBeCloseTo(expectedYield, 2); // 2 decimal places
    });
});
