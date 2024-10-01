import {
    Account,
    Asset,
    BaseTransaction,
    EditGroupTransactionInput,
    EditTransactionFeeInput,
    FixedIncome,
    GroupTransaction,
    RealWorldAssetsState,
    ServiceProviderFeeType,
} from '../..';
import {
    ASSET_PURCHASE,
    INTEREST_INCOME,
    INTEREST_PAYMENT,
} from '../constants';
import {
    validateAssetGroupTransaction,
    validateBaseTransaction,
    validateCashTransaction,
    validateFeesGroupTransaction,
    validateFixedIncomeAsset,
    validateFixedIncomeTransaction,
    validateInterestGroupTransaction,
    validateSharedGroupTransactionFields,
    validateTransactionFee,
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
    type: 'FixedIncome' as const,
    fixedIncomeTypeId: '',
    name: '',
    spvId: '',
    maturity: '',
    purchaseDate: '',
    notional: 0,
    assetProceeds: 0,
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
            portfolio: [{ id: '1', type: 'Cash', spvId: 'equity' }],
        } as RealWorldAssetsState;
        const transaction = {
            assetId: '1',
            assetType: 'FixedIncome' as const,
            amount: 100,
            entryTime: new Date().toISOString(),
        } as BaseTransaction;

        expect(() =>
            validateFixedIncomeTransaction(state, transaction),
        ).toThrow('Fixed income transaction must have a fixed income type');
    });

    it('should not throw an error when the asset is a fixed income asset', () => {
        const state = {
            portfolio: [
                { id: '1', type: 'FixedIncome', fixedIncomeTypeId: '1' },
            ],
        } as RealWorldAssetsState;
        const transaction = {
            assetId: '1',
            assetType: 'FixedIncome' as const,
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
            portfolio: [{ id: '1', type: 'Cash', currency: 'USD' }] as Asset[],
            accounts: [{ id: 'somethingElse' }] as Account[],
            feeTypes: [{ id: 'somethingElse' }] as ServiceProviderFeeType[],
        };
        const transaction = {
            ...mockEmptyBaseTransaction,
            assetType: 'Cash' as const,
            assetId: '1',
            counterPartyAccountId: 'somethingElse',
            amount: 100,
            entryTime: new Date().toISOString(),
        };

        expect(() => validateCashTransaction(state, transaction)).toThrow(
            'Cash transaction must have the principal lender as the counter party',
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
            'Cash transaction must have a cash type',
        );
    });

    it('should not throw an error when the counterParty is the principalLender and the asset is a cash asset', () => {
        const state = {
            ...mockEmptyInitialState,
            principalLenderAccountId: 'principalLender1',
            portfolio: [{ id: '1', type: 'Cash', currency: 'USD' }] as Asset[],
            accounts: [{ id: 'principalLender1' }] as Account[],
            feeTypes: [{ id: 'principalLender1' }] as ServiceProviderFeeType[],
        };
        const transaction = {
            ...mockEmptyBaseTransaction,
            assetType: 'Cash' as const,
            assetId: '1',
            counterPartyAccountId: 'principalLender1',
            amount: 100,
        };

        expect(() => validateCashTransaction(state, transaction)).not.toThrow();
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

describe('validateTransactionFee', () => {
    const mockState = {
        serviceProviderFeeTypes: [{ id: 'service1' }, { id: 'service2' }],
    } as RealWorldAssetsState;

    it('should throw an error if the fee does not exist', () => {
        expect(() => validateTransactionFee(mockState, null)).toThrow(
            'Fee does not exist',
        );
    });

    it('should throw an error if the fee does not have a service provider', () => {
        const fee: EditTransactionFeeInput = { amount: 100 };
        expect(() => validateTransactionFee(mockState, fee)).toThrow(
            'Transaction fee must have a service provider',
        );
    });

    it('should throw an error if the fee does not have an amount', () => {
        const fee: EditTransactionFeeInput = {
            serviceProviderFeeTypeId: 'service1',
        };
        expect(() => validateTransactionFee(mockState, fee)).toThrow(
            'Transaction fee must have an amount',
        );
    });

    it('should throw an error if the service provider does not exist', () => {
        const fee: EditTransactionFeeInput = {
            serviceProviderFeeTypeId: 'nonexistent',
            amount: 100,
        };
        expect(() => validateTransactionFee(mockState, fee)).toThrow(
            'Service provider with account id nonexistent does not exist!',
        );
    });

    it('should throw an error if the fee amount is not a positive number', () => {
        const fee: EditTransactionFeeInput = {
            serviceProviderFeeTypeId: 'service1',
            amount: -100,
        };
        expect(() => validateTransactionFee(mockState, fee)).toThrow(
            'Fee amount must be a number',
        );
    });

    it('should pass validation if the fee is valid', () => {
        const fee: EditTransactionFeeInput = {
            serviceProviderFeeTypeId: 'service1',
            amount: 100,
        };
        expect(() => validateTransactionFee(mockState, fee)).not.toThrow();
    });
});

describe('validateSharedGroupTransactionFields', () => {
    it('should throw an error if the transaction does not have an id', () => {
        const transaction: Partial<EditGroupTransactionInput> = {
            type: ASSET_PURCHASE,
            entryTime: '2023-01-01T00:00:00Z',
        };
        expect(() => validateSharedGroupTransactionFields(transaction)).toThrow(
            'Transaction must have an id',
        );
    });

    it('should throw an error if the transaction does not have a type', () => {
        const transaction: Partial<EditGroupTransactionInput> = {
            id: 'tx1',
            entryTime: '2023-01-01T00:00:00Z',
        };
        expect(() => validateSharedGroupTransactionFields(transaction)).toThrow(
            'Transaction must have a type',
        );
    });

    it('should throw an error if the transaction does not have an entry time', () => {
        const transaction: Partial<EditGroupTransactionInput> = {
            id: 'tx1',
            type: ASSET_PURCHASE,
        };
        expect(() => validateSharedGroupTransactionFields(transaction)).toThrow(
            'Transaction must have an entry time',
        );
    });

    it('should throw an error if the entry time is not a valid date', () => {
        const transaction: Partial<EditGroupTransactionInput> = {
            id: 'tx1',
            type: ASSET_PURCHASE,
            entryTime: 'invalid-date',
        };
        expect(() => validateSharedGroupTransactionFields(transaction)).toThrow(
            'Entry time must be a valid date',
        );
    });

    it('should pass validation if the transaction is valid', () => {
        const transaction: Partial<EditGroupTransactionInput> = {
            id: 'tx1',
            type: ASSET_PURCHASE,
            entryTime: '2023-01-01T00:00:00Z',
        };
        expect(() =>
            validateSharedGroupTransactionFields(transaction),
        ).not.toThrow();
    });
});

describe('validateAssetGroupTransaction', () => {
    const mockState = {
        portfolio: [{ id: '1', type: 'FixedIncome' }],
        serviceProviderFeeTypes: [{ id: 'service1' }, { id: 'service2' }],
    } as RealWorldAssetsState;

    const mockTransaction = {
        fixedIncomeTransaction: {
            assetType: 'FixedIncome',
            assetId: '1',
            amount: 1000,
            entryTime: '2023-01-01T00:00:00Z',
        },
        unitPrice: 100,
        fees: [
            { amount: 10, serviceProviderFeeTypeId: 'service1' },
            { amount: 5, serviceProviderFeeTypeId: 'service2' },
        ],
    } as GroupTransaction;

    it('should throw an error if the transaction does not have a fixed income transaction', () => {
        const transaction = {
            ...mockTransaction,
            fixedIncomeTransaction: null,
        } as unknown as GroupTransaction;
        expect(() =>
            validateAssetGroupTransaction(mockState, transaction),
        ).toThrow('Asset transaction must have a fixed income transaction');
    });

    it('should throw an error if the transaction does not have a unit price', () => {
        const transaction = {
            ...mockTransaction,
            unitPrice: null,
        } as unknown as GroupTransaction;
        expect(() =>
            validateAssetGroupTransaction(mockState, transaction),
        ).toThrow('Asset transaction must have a unit price');
    });

    it('should throw an error if the unit price is not a number', () => {
        const transaction = {
            ...mockTransaction,
            unitPrice: 'invalid-price' as unknown as number,
        } as unknown as GroupTransaction;
        expect(() =>
            validateAssetGroupTransaction(mockState, transaction),
        ).toThrow('Unit price must be a number');
    });

    it('should throw an error if the unit price is not positive', () => {
        const transaction = {
            ...mockTransaction,
            unitPrice: -100,
        } as unknown as GroupTransaction;
        expect(() =>
            validateAssetGroupTransaction(mockState, transaction),
        ).toThrow('Unit price must be positive');
    });

    it('should pass validation if the transaction is valid', () => {
        expect(() =>
            validateAssetGroupTransaction(mockState, mockTransaction),
        ).not.toThrow();
    });
});

describe('validateInterestGroupTransaction', () => {
    const mockState = {
        principalLenderAccountId: 'principalLender123',
        accounts: [{ id: 'account1' }, { id: 'account2' }],
        serviceProviderFeeTypes: [{ id: 'service1' }, { id: 'service2' }],
    } as RealWorldAssetsState;

    const mockTransaction = {
        type: INTEREST_PAYMENT,
        cashTransaction: {
            counterPartyAccountId: 'principalLender123',
        },
        fees: [
            { amount: 10, serviceProviderFeeTypeId: 'service1' },
            { amount: 5, serviceProviderFeeTypeId: 'service2' },
        ],
    } as GroupTransaction;

    it('should throw an error if the transaction does not have a counter party account', () => {
        const transaction = {
            ...mockTransaction,
            cashTransaction: {
                counterPartyAccountId: undefined,
            },
        } as unknown as GroupTransaction;
        expect(() =>
            validateInterestGroupTransaction(mockState, transaction),
        ).toThrow('Interest transaction must have a counter party account');
    });

    it('should throw an error if the interest payment does not have the principal lender as the counter party', () => {
        const transaction = {
            ...mockTransaction,
            cashTransaction: {
                counterPartyAccountId: 'someOtherAccount',
            },
        } as unknown as GroupTransaction;
        expect(() =>
            validateInterestGroupTransaction(mockState, transaction),
        ).toThrow(
            'Interest payment must have the principal lender as the counter party',
        );
    });

    it('should throw an error if the counter party for interest income does not exist', () => {
        const transaction = {
            ...mockTransaction,
            type: INTEREST_INCOME,
            cashTransaction: {
                counterPartyAccountId: 'nonExistentAccount',
            },
        } as unknown as GroupTransaction;
        expect(() =>
            validateInterestGroupTransaction(mockState, transaction),
        ).toThrow(
            'Counter party with account id nonExistentAccount does not exist!',
        );
    });

    it('should pass validation if the transaction is a valid interest payment', () => {
        expect(() =>
            validateInterestGroupTransaction(mockState, mockTransaction),
        ).not.toThrow();
    });

    it('should pass validation if the transaction is a valid interest income', () => {
        const transaction = {
            ...mockTransaction,
            type: INTEREST_INCOME,
            cashTransaction: {
                counterPartyAccountId: 'account1',
            },
        } as unknown as GroupTransaction;
        expect(() =>
            validateInterestGroupTransaction(mockState, transaction),
        ).not.toThrow();
    });
});

describe('validateFeesGroupTransaction', () => {
    const mockState = {
        serviceProviderFeeTypes: [{ id: 'service1' }, { id: 'service2' }],
    } as RealWorldAssetsState;

    const mockTransaction = {
        serviceProviderFeeTypeId: 'service1',
        fees: [{ amount: 10 }, { amount: 5 }],
    } as GroupTransaction;

    it('should not throw an error if the transaction does not have a service provider fee type id', () => {
        const transaction = {
            ...mockTransaction,
            serviceProviderFeeTypeId: undefined,
        } as unknown as GroupTransaction;
        expect(() =>
            validateFeesGroupTransaction(mockState, transaction),
        ).not.toThrow();
    });

    it('should throw an error if the service provider fee type does not exist', () => {
        const transaction = {
            ...mockTransaction,
            serviceProviderFeeTypeId: 'nonExistentServiceProvider',
        };
        expect(() =>
            validateFeesGroupTransaction(mockState, transaction),
        ).toThrow(
            'Service provider with id nonExistentServiceProvider does not exist!',
        );
    });

    it('should pass validation if the service provider fee type exists', () => {
        expect(() =>
            validateFeesGroupTransaction(mockState, mockTransaction),
        ).not.toThrow();
    });
});
