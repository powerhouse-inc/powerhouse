/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { generateMock } from '@powerhousedao/codegen';

import * as creators from '../../gen/portfolio/creators';
import { reducer } from '../../gen/reducer';
import { Asset, z } from '../../gen/schema';
import utils from '../../gen/utils';

describe('Portfolio Operations', () => {
    it('should handle createFixedIncomeAsset operation', () => {
        const input = generateMock(z.CreateFixedIncomeAssetInputSchema());
        const existingFixedIncomeType = generateMock(z.FixedIncomeTypeSchema());
        input.fixedIncomeTypeId = existingFixedIncomeType.id;
        const existingSpv = generateMock(z.SpvSchema());
        input.spvId = existingSpv.id;
        const document = utils.createDocument({
            state: {
                global: {
                    fixedIncomeTypes: [existingFixedIncomeType],
                    spvs: [existingSpv],
                },
                local: {},
            },
        });
        const updatedDocument = reducer(
            document,
            creators.createFixedIncomeAsset(input),
        );

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe(
            'CREATE_FIXED_INCOME_ASSET',
        );
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });
    it('should handle createCashAsset operation', () => {
        const input = generateMock(z.CreateCashAssetInputSchema());
        input.currency = 'USD';
        const existingSpv = generateMock(z.SpvSchema());
        existingSpv.id = input.spvId;
        const document = utils.createDocument({
            state: {
                global: {
                    spvs: [existingSpv],
                },
                local: {},
            },
        });
        const updatedDocument = reducer(
            document,
            creators.createCashAsset(input),
        );

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe(
            'CREATE_CASH_ASSET',
        );
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });
    it('should handle editFixedIncomeAsset operation', () => {
        const existingAsset = generateMock(
            z.CreateFixedIncomeAssetInputSchema(),
        ) as Asset;
        const input = generateMock(z.EditFixedIncomeAssetInputSchema());
        const existingFixedIncomeType = generateMock(z.FixedIncomeTypeSchema());
        existingAsset.id = input.id;
        input.fixedIncomeTypeId = existingFixedIncomeType.id;
        const existingSpv = generateMock(z.SpvSchema());
        input.spvId = existingSpv.id;
        const document = utils.createDocument({
            state: {
                global: {
                    portfolio: [existingAsset],
                    fixedIncomeTypes: [existingFixedIncomeType],
                    spvs: [existingSpv],
                },
                local: {},
            },
        });
        const updatedDocument = reducer(
            document,
            creators.editFixedIncomeAsset(input),
        );

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe(
            'EDIT_FIXED_INCOME_ASSET',
        );
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });
    it('should handle editCashAsset operation', () => {
        const input = generateMock(z.EditCashAssetInputSchema());
        input.currency = 'USD';
        const existingSpv = generateMock(z.SpvSchema());
        input.spvId = existingSpv.id;
        const existingAsset = {
            ...generateMock(z.CreateCashAssetInputSchema()),
            id: input.id,
            type: 'Cash' as const,
        };
        const document = utils.createDocument({
            state: {
                global: {
                    portfolio: [existingAsset],
                    spvs: [existingSpv],
                },
                local: {},
            },
        });
        const updatedDocument = reducer(
            document,
            creators.editCashAsset(input),
        );

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe(
            'EDIT_CASH_ASSET',
        );
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });
    it('should handle deleteFixedIncomeAsset operation', () => {
        const input = generateMock(z.DeleteFixedIncomeAssetInputSchema());
        const existingAsset = generateMock(z.FixedIncomeSchema());
        input.id = existingAsset.id;
        const document = utils.createDocument({
            state: {
                global: {
                    portfolio: [existingAsset],
                },
                local: {},
            },
        });
        const updatedDocument = reducer(
            document,
            creators.deleteFixedIncomeAsset(input),
        );

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe(
            'DELETE_FIXED_INCOME_ASSET',
        );
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });
    it('should handle deleteCashAsset operation', () => {
        const input = generateMock(z.DeleteCashAssetInputSchema());
        const existingAsset = {
            ...generateMock(z.CreateCashAssetInputSchema()),
            type: 'Cash' as const,
        };
        input.id = existingAsset.id;
        const document = utils.createDocument({
            state: {
                global: {
                    portfolio: [existingAsset],
                },
                local: {},
            },
        });
        const updatedDocument = reducer(
            document,
            creators.deleteCashAsset(input),
        );

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe(
            'DELETE_CASH_ASSET',
        );
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });
});
