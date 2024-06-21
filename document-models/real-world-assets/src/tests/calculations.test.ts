import { copy } from 'copy-anything';
import {
    BaseTransaction,
    GroupTransaction,
    TransactionFee,
    calculateAssetProceeds,
    calculateCashBalanceChange,
    calculateNotional,
    calculatePurchasePrice,
    calculatePurchaseProceeds,
    calculateRealizedSurplus,
    calculateSalesProceeds,
    calculateTotalDiscount,
    calculateTotalFees,
    calculateUnitPrice,
    roundToNearestDay,
    sumAssetTransactionsForType,
    sumCashTransactionsForType,
    sumGroupTransactionFees,
} from 'document-models/real-world-assets';
import { describe, expect, it } from 'vitest';
import {
    ASSET_PURCHASE,
    ASSET_SALE,
    FEES_INCOME,
    FEES_PAYMENT,
    INTEREST_INCOME,
    INTEREST_PAYMENT,
    PRINCIPAL_DRAW,
    PRINCIPAL_RETURN,
    allGroupTransactionTypes,
} from '../constants';

const baseMockTransaction = {
    cashTransaction: {
        amount: 1,
    },
    fees: null,
};

const assetSaleMockTransaction = {
    ...baseMockTransaction,
    type: ASSET_SALE,
    fixedIncomeTransaction: {
        amount: 1,
        entryTime: '2023-01-01T00:00:00Z',
    },
};

const assetPurchaseMockTransaction = {
    ...baseMockTransaction,
    type: ASSET_PURCHASE,
    fixedIncomeTransaction: {
        amount: 1,
        entryTime: '2023-01-01T00:00:00Z',
    },
};

const principalDrawMockTransaction = {
    ...baseMockTransaction,
    type: PRINCIPAL_DRAW,
};

const principalReturnMockTransaction = {
    ...baseMockTransaction,
    type: PRINCIPAL_RETURN,
};

const interestIncomeMockTransaction = {
    ...baseMockTransaction,
    type: INTEREST_INCOME,
};

const interestPaymentMockTransaction = {
    ...baseMockTransaction,
    type: INTEREST_PAYMENT,
};

const feesIncomeMockTransaction = {
    ...baseMockTransaction,
    type: FEES_INCOME,
};

const feesPaymentMockTransaction = {
    ...baseMockTransaction,
    type: FEES_PAYMENT,
};

const mockFee = { amount: 1 } as TransactionFee;

// describe('computeFixedIncomeAssetDerivedFields', () => {
//     it('should compute the derived fields correctly', () => {
//         const result = computeFixedIncomeAssetDerivedFields(mockTransactions);
//         expect(result.purchaseDate).toBe('2023-01-01T00:00:00.000Z');
//         expect(result.notional).toBe(950);
//         expect(result.assetProceeds).toBe(500);
//         expect(result.purchaseProceeds).toBe(1010);
//         expect(result.salesProceeds).toBe(1495);
//         expect(result.purchasePrice).toBe(10);
//         expect(result.totalDiscount).toBe(-45);
//         expect(result.realizedSurplus).toBe(485);
//     });
// });

// describe('calculatePurchaseDate', () => {
//     it('should calculate the correct purchase date', () => {
//         const result = calculatePurchaseDate(mockTransactions);
//         expect(result).toBe('2023-01-01T00:00:00.000Z');
//     });
// });

describe('calculateNotional', () => {
    it('should calculate the correct notional', () => {
        const transactions = copy([
            assetPurchaseMockTransaction,
            assetPurchaseMockTransaction,
            assetSaleMockTransaction,
            assetSaleMockTransaction,
        ]) as GroupTransaction[];
        const result = calculateNotional(transactions);
        expect(result.toNumber()).toBe(1);
    });
});

describe('calculateAssetProceeds', () => {
    it('should calculate the correct asset proceeds', () => {
        const transactions = copy([
            assetPurchaseMockTransaction,
            assetPurchaseMockTransaction,
            assetSaleMockTransaction,
            assetSaleMockTransaction,
        ]) as GroupTransaction[];
        const result = calculateAssetProceeds(transactions);
        expect(result.toNumber()).toBe(0);
    });
});

describe('calculatePurchaseProceeds', () => {
    it('should calculate the correct purchase proceeds', () => {
        const transactions = copy([
            assetPurchaseMockTransaction,
            assetPurchaseMockTransaction,
        ]) as GroupTransaction[];
        for (const tx of transactions) {
            tx.fees = [mockFee];
        }
        const result = calculatePurchaseProceeds(transactions);
        expect(result.toNumber()).toBe(4);
    });
});

describe('calculateSalesProceeds', () => {
    it('should calculate the correct sales proceeds', () => {
        const transactions = copy([
            assetSaleMockTransaction,
            assetSaleMockTransaction,
        ]) as GroupTransaction[];
        for (const tx of transactions) {
            tx.fees = [mockFee];
        }
        const result = calculateSalesProceeds(transactions);
        expect(result.toNumber()).toBe(0);
    });
});

describe('calculatePurchasePrice', () => {
    it('should calculate the correct purchase price', () => {
        const transactions = copy([
            assetPurchaseMockTransaction,
            assetPurchaseMockTransaction,
            assetPurchaseMockTransaction,
            assetPurchaseMockTransaction,
        ]) as GroupTransaction[];
        const result = calculatePurchasePrice(transactions);
        expect(result.toNumber()).toBe(1);
    });

    it('should avoid divide by zero', () => {
        const transactions = copy([
            assetPurchaseMockTransaction,
            assetPurchaseMockTransaction,
            assetPurchaseMockTransaction,
            assetPurchaseMockTransaction,
        ]) as GroupTransaction[];
        for (const tx of transactions) {
            tx.fixedIncomeTransaction = { amount: 0 } as BaseTransaction;
        }
        const result = calculatePurchasePrice(transactions);
        expect(result.toNumber()).toBe(0);
    });
});

describe('calculateTotalDiscount', () => {
    it('should calculate the correct total discount', () => {
        const purchaseTransactions = copy([
            assetPurchaseMockTransaction,
            assetPurchaseMockTransaction,
        ]);
        const salesTransactions = copy([
            assetSaleMockTransaction,
            assetSaleMockTransaction,
        ]);
        for (const tx of salesTransactions) {
            tx.cashTransaction = { amount: 3 } as BaseTransaction;
        }
        const transactions = [
            ...purchaseTransactions,
            ...salesTransactions,
        ] as GroupTransaction[];
        for (const tx of transactions) {
            tx.fees = [mockFee];
        }
        const result = calculateTotalDiscount(transactions);
        expect(result.toNumber()).toBe(1);
    });
});

describe('calculateRealizedSurplus', () => {
    it('should calculate the correct realized surplus', () => {
        const purchaseTransactions = copy([
            assetPurchaseMockTransaction,
            assetPurchaseMockTransaction,
        ]);
        const salesTransactions = copy([
            assetSaleMockTransaction,
            assetSaleMockTransaction,
        ]);
        for (const tx of salesTransactions) {
            tx.cashTransaction = { amount: 4 } as BaseTransaction;
        }
        const transactions = [
            ...purchaseTransactions,
            ...salesTransactions,
        ] as GroupTransaction[];
        for (const tx of transactions) {
            tx.fees = [mockFee];
        }
        const result = calculateRealizedSurplus(transactions);
        expect(result.toNumber()).toBe(2);
    });

    it('should return zero if calculated amount is negative', () => {
        const purchaseTransactions = copy([
            assetPurchaseMockTransaction,
            assetPurchaseMockTransaction,
        ]);
        const salesTransactions = copy([
            assetSaleMockTransaction,
            assetSaleMockTransaction,
        ]);
        for (const tx of purchaseTransactions) {
            tx.cashTransaction = { amount: 4 } as BaseTransaction;
        }
        const transactions = [
            ...purchaseTransactions,
            ...salesTransactions,
        ] as GroupTransaction[];
        for (const tx of transactions) {
            tx.fees = [mockFee];
        }
        const result = calculateRealizedSurplus(transactions);
        expect(result.toNumber()).toBe(0);
    });
});

describe('sumGroupTransactionFees', () => {
    it('should sum the group transaction fees correctly', () => {
        const transactions = copy([
            assetPurchaseMockTransaction,
            assetSaleMockTransaction,
            principalDrawMockTransaction,
            principalReturnMockTransaction,
            interestIncomeMockTransaction,
            interestPaymentMockTransaction,
            feesIncomeMockTransaction,
            feesPaymentMockTransaction,
        ]) as GroupTransaction[];
        for (const tx of transactions) {
            tx.fees = [mockFee];
        }
        const result = sumGroupTransactionFees(transactions);
        expect(result.toNumber()).toBe(8);
    });
});

describe('sumCashTransactionsForType', () => {
    it('should sum the cash transactions for a type correctly', () => {
        const transactions = copy([
            assetPurchaseMockTransaction,
            assetSaleMockTransaction,
            principalDrawMockTransaction,
            principalReturnMockTransaction,
            interestIncomeMockTransaction,
            interestPaymentMockTransaction,
            feesIncomeMockTransaction,
            feesPaymentMockTransaction,
            assetPurchaseMockTransaction,
            assetSaleMockTransaction,
            principalDrawMockTransaction,
            principalReturnMockTransaction,
            interestIncomeMockTransaction,
            interestPaymentMockTransaction,
            feesIncomeMockTransaction,
            feesPaymentMockTransaction,
        ]) as GroupTransaction[];

        const results = allGroupTransactionTypes.map(type => {
            const result = sumCashTransactionsForType(
                transactions,
                type,
            ).toNumber();
            return result;
        });

        for (const result of results) {
            expect(result).toBe(2);
        }
    });
});

describe('sumAssetTransactionsForType', () => {
    it('should sum the asset transactions for a type correctly', () => {
        const transactions = copy([
            assetSaleMockTransaction,
            assetSaleMockTransaction,
            assetPurchaseMockTransaction,
            assetPurchaseMockTransaction,
        ]) as GroupTransaction[];

        const resultSumSale = sumAssetTransactionsForType(
            transactions,
            ASSET_SALE,
        );
        const resultSumPurchase = sumAssetTransactionsForType(
            transactions,
            ASSET_PURCHASE,
        );
        expect(resultSumSale.toNumber()).toBe(2);
        expect(resultSumPurchase.toNumber()).toBe(2);
    });
});

describe('roundToNearestDay', () => {
    it('should round the date to the nearest day correctly', () => {
        const date = new Date('2023-01-01T12:00:00Z');
        const result = roundToNearestDay(date);
        expect(result.toISOString()).toBe('2023-01-02T00:00:00.000Z');
    });
});

describe('calculateCashBalanceChange', () => {
    it('should calculate the cash balance change correctly', () => {
        const assetPurchaseResult = calculateCashBalanceChange(
            ASSET_PURCHASE,
            1,
            [mockFee],
        );
        const assetSaleResult = calculateCashBalanceChange(ASSET_SALE, 1, [
            mockFee,
        ]);
        const principalDrawResult = calculateCashBalanceChange(
            PRINCIPAL_DRAW,
            1,
            [mockFee],
        );
        const principalReturnResult = calculateCashBalanceChange(
            PRINCIPAL_RETURN,
            1,
            [mockFee],
        );
        const interestIncomeResult = calculateCashBalanceChange(
            INTEREST_INCOME,
            1,
            [mockFee],
        );
        const interestPaymentResult = calculateCashBalanceChange(
            INTEREST_PAYMENT,
            1,
            [mockFee],
        );
        const feesIncomeResult = calculateCashBalanceChange(FEES_INCOME, 1, [
            mockFee,
        ]);
        const feesPaymentResult = calculateCashBalanceChange(FEES_PAYMENT, 1, [
            mockFee,
        ]);

        expect(assetPurchaseResult.toNumber()).toBe(-2);
        expect(assetSaleResult.toNumber()).toBe(0);
        expect(principalDrawResult.toNumber()).toBe(0);
        expect(principalReturnResult.toNumber()).toBe(-2);
        expect(interestIncomeResult.toNumber()).toBe(0);
        expect(interestPaymentResult.toNumber()).toBe(-2);
        expect(feesIncomeResult.toNumber()).toBe(0);
        expect(feesPaymentResult.toNumber()).toBe(-2);
    });
});

describe('calculateTotalFees', () => {
    it('should calculate the total fees correctly', () => {
        const result = calculateTotalFees([
            { amount: 1 },
            { amount: 1 },
        ] as TransactionFee[]);
        expect(result.toNumber()).toBe(2);
    });
});

describe('calculateUnitPrice', () => {
    it('should calculate the unit price correctly', () => {
        const result = calculateUnitPrice(4, 2);
        expect(result.toNumber()).toBe(2);
    });
});
