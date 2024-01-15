/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { generateMock } from '@powerhousedao/codegen';

import * as creators from '../../gen/account/creators';
import { reducer } from '../../gen/reducer';
import { z } from '../../gen/schema';
import { BudgetStatementDocument } from '../../gen/types';
import utils from '../../gen/utils';
import { createAccount } from '../utils';

describe('Budget Statement account reducer', () => {
    let document: BudgetStatementDocument;

    beforeEach(() => {
        document = utils.createDocument();
    });

    it('should add account', () => {
        const input = generateMock(z.AddAccountInputSchema());
        const updatedDocument = reducer(document, creators.addAccount(input));

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe('ADD_ACCOUNT');
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
        expect(updatedDocument.state.global.accounts).toEqual([input]);
        expect(document.state.global.accounts).toStrictEqual([]);
    });

    it('should update account', () => {
        const initialInput = generateMock(z.UpdateAccountInputSchema());
        const inputToUpdate = generateMock(z.UpdateAccountInputSchema());
        inputToUpdate.address = initialInput.address;

        const document = utils.createDocument({
            state: {
                global: {
                    // @ts-expect-error mock
                    accounts: [initialInput],
                },
            },
        });

        const updatedDocument = reducer(
            document,
            creators.updateAccount(inputToUpdate),
        );

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe(
            'UPDATE_ACCOUNT',
        );
        expect(updatedDocument.operations.global[0].input).toEqual(
            inputToUpdate,
        );
        expect(updatedDocument.operations.global[0].index).toEqual(0);
        expect(updatedDocument.state.global.accounts[0].name).toBe(
            inputToUpdate.name,
        );
        expect(document.state.global.accounts[0].name).toBe(initialInput.name);
    });

    it('should delete account', () => {
        const initialStateInput = generateMock(z.AddAccountInputSchema());
        const inputToDelete = generateMock(z.DeleteAccountInputSchema());
        inputToDelete.account = initialStateInput.address;
        const document = utils.createDocument({
            state: {
                global: {
                    // @ts-expect-error mock
                    accounts: [initialStateInput],
                },
                local: {},
            },
        });
        const updatedDocument = reducer(
            document,
            creators.deleteAccount(inputToDelete),
        );

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe(
            'DELETE_ACCOUNT',
        );
        expect(updatedDocument.operations.global[0].input).toEqual(
            inputToDelete,
        );
        expect(updatedDocument.operations.global[0].index).toEqual(0);
        expect(updatedDocument.state.global.accounts.length).toBe(0);
        expect(document.state.global.accounts.length).toBe(1);
    });

    it('should throw exception if adding account with same address', () => {
        const input = generateMock(z.AddAccountInputSchema());
        const inputWithTheSameAddress = generateMock(z.AddAccountInputSchema());
        inputWithTheSameAddress.address = input.address;
        document = reducer(document, creators.addAccount(input));
        expect(() =>
            reducer(document, creators.addAccount(inputWithTheSameAddress)),
        ).toThrow();
    });

    it('should sort accounts', () => {
        const mockAccounts = [
            createAccount({
                address: 'eth:0x00',
                name: '0',
            }),
            createAccount({
                address: 'eth:0x01',
                name: '1',
            }),
            createAccount({
                address: 'eth:0x02',
                name: '2',
            }),
        ];
        const sortAccountsInput = ['eth:0x02', 'eth:0x00'];
        const document = utils.createDocument({
            state: {
                global: {
                    accounts: mockAccounts,
                },
                local: {},
            },
        });
        const updatedDocument = reducer(
            document,
            creators.sortAccounts({ accounts: sortAccountsInput }),
        );

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe('SORT_ACCOUNTS');
        expect(updatedDocument.operations.global[0].input).toStrictEqual({
            accounts: sortAccountsInput,
        });
        expect(updatedDocument.operations.global[0].index).toEqual(0);
        expect(
            updatedDocument.state.global.accounts.map(a => a.address),
        ).toStrictEqual(['eth:0x02', 'eth:0x00', 'eth:0x01']);
    });
});
