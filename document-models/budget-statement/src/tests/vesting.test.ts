/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { generateMock } from '@powerhousedao/codegen';

import * as creators from '../../gen/creators';
import { reducer } from '../../gen/reducer';
import { z } from '../../gen/schema';
import { BudgetStatementDocument } from '../../gen/types';
import utils from '../../gen/utils';

const { addVesting, updateVesting, deleteVesting } = creators;
const { createDocument } = utils;

describe('Budget Statement vesting reducer', () => {
    let document: BudgetStatementDocument;

    beforeEach(() => {
        document = createDocument();
    });

    it('should start as empty array', () => {
        expect(document.state.global.vesting).toStrictEqual([]);
    });

    it('should add comment', () => {
        const newDocument = reducer(
            document,
            addVesting({
                amount: '100',
                amountOld: '40',
                comment: 'New FTEs',
                currency: 'MKR',
                date: '2023-03-15',
                key: '123',
                vested: false,
            }),
        );
        expect(newDocument.state.global.vesting).toStrictEqual([
            {
                amount: '100',
                amountOld: '40',
                comment: 'New FTEs',
                currency: 'MKR',
                date: '2023-03-15',
                key: '123',
                vested: false,
            },
        ]);
        expect(document.state.global.vesting).toStrictEqual([]);
    });

    it('should update vesting', () => {
        const document = createDocument({
            state: {
                global: {
                    vesting: [
                        {
                            amount: '100',
                            amountOld: '40',
                            comment: 'New FTEs',
                            currency: 'MKR',
                            date: '2023-03-15',
                            key: '123',
                            vested: false,
                        },
                    ],
                },
                local: {},
            },
        });

        const updatedDocument = reducer(
            document,
            updateVesting({ key: '123', amount: '300' }),
        );
        expect(updatedDocument.state.global.vesting[0]).toStrictEqual({
            amount: '300',
            amountOld: '40',
            comment: 'New FTEs',
            currency: 'MKR',
            date: '2023-03-15',
            key: '123',
            vested: false,
        });
    });

    it('should delete vesting', () => {
        const document = createDocument({
            state: {
                global: {
                    vesting: [
                        {
                            amount: '100',
                            amountOld: '40',
                            comment: 'New FTEs',
                            currency: 'MKR',
                            date: '2023-03-15',
                            key: '123',
                            vested: false,
                        },
                    ],
                },
                local: {},
            },
        });

        const updatedDocument = reducer(
            document,
            deleteVesting({ vesting: '123' }),
        );
        expect(updatedDocument.state.global.vesting.length).toBe(0);
    });

    it('should generate vesting key if undefined', () => {
        vi.useFakeTimers({ now: new Date('2023-03-16') });
        const newDocument = reducer(
            document,
            addVesting({
                date: '2023-03-16',
            }),
        );
        expect(newDocument.state.global.vesting[0].key.length).toBe(28);
        expect(newDocument.state.global.vesting[0].amount).toBe('');
    });

    it('should sort vestings by date', () => {
        let newDocument = reducer(
            document,
            addVesting({
                date: '2023-03-11',
            }),
        );
        newDocument = reducer(
            newDocument,
            addVesting({
                date: '2023-03-15',
            }),
        );
        newDocument = reducer(
            newDocument,
            addVesting({
                date: '2023-03-13',
            }),
        );

        expect(newDocument.state.global.vesting[0].date).toBe('2023-03-11');
        expect(newDocument.state.global.vesting[1].date).toBe('2023-03-13');
        expect(newDocument.state.global.vesting[2].date).toBe('2023-03-15');
    });

    it('should throw if vesting key already exists', () => {
        let document = createDocument({
            state: {
                global: {
                    vesting: [
                        // @ts-expect-error mock
                        {
                            key: '123',
                            date: '2023-03-15',
                        },
                    ],
                },
            },
        });

        document = reducer(
            document,
            addVesting({
                key: '123',
                date: '2023-03-13',
            }),
        );

        expect(document.state.global).toMatchObject({
            vesting: [
                {
                    key: '123',
                    date: '2023-03-15',
                },
            ],
        });
        expect(document.operations.global).toHaveLength(1);
        expect(document.operations.global[0]).toMatchObject({
            type: 'ADD_VESTING',
            input: { key: '123', date: '2023-03-13' },
            scope: 'global',
            index: 0,
            skip: 0,
            error: 'Vesting with key 123 already exists',
        });
    });

    it('should ignore non existing keys on update', () => {
        let document = createDocument();
        document = reducer(
            document,
            addVesting({
                key: '123',
                amount: '100',
            }),
        );

        document = reducer(
            document,
            updateVesting({
                key: '123',
                amount: '200',
            }),
        );

        document = reducer(
            document,
            updateVesting({
                key: '456',
                amount: '300',
            }),
        );

        expect(document.state.global.vesting).toStrictEqual([
            {
                amount: '200',
                amountOld: '100',
                comment: '',
                currency: '',
                date: '',
                key: '123',
                vested: false,
            },
        ]);
    });

    it('should handle addVesting operation', () => {
        const input = generateMock(z.AddVestingInputSchema());
        const updatedDocument = reducer(document, creators.addVesting(input));

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe('ADD_VESTING');
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

    it('should handle updateVesting operation', () => {
        const input = generateMock(z.UpdateVestingInputSchema());
        const updatedDocument = reducer(
            document,
            creators.updateVesting(input),
        );

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe(
            'UPDATE_VESTING',
        );
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

    it('should handle deleteVesting operation', () => {
        const input = generateMock(z.DeleteVestingInputSchema());
        const updatedDocument = reducer(
            document,
            creators.deleteVesting(input),
        );

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe(
            'DELETE_VESTING',
        );
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });
});
