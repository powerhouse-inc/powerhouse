/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { generateMock } from '@powerhousedao/codegen';

import * as creators from '../../gen/general/creators';
import { reducer } from '../../gen/reducer';
import { z } from '../../gen/schema';
import { RealWorldAssetsDocument } from '../../gen/types';
import utils from '../../gen/utils';

describe('General Operations', () => {
    let document: RealWorldAssetsDocument;

    beforeEach(() => {
        document = utils.createDocument();
    });

    it('should handle createSpv operation', () => {
        const input = generateMock(z.CreateSpvInputSchema());
        const updatedDocument = reducer(document, creators.createSpv(input));

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe('CREATE_SPV');
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });
    it('should handle editSpv operation', () => {
        const initialInput = generateMock(z.CreateSpvInputSchema());
        const newInput = generateMock(z.EditSpvInputSchema());
        newInput.id = initialInput.id;
        const document = utils.createDocument({
            state: {
                global: {
                    spvs: [initialInput],
                },
                local: {},
            },
        });
        const updatedDocument = reducer(document, creators.editSpv(newInput));

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe('EDIT_SPV');
        expect(updatedDocument.operations.global[0].input).toStrictEqual(
            newInput,
        );
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });
    it('should handle deleteSpv operation', () => {
        const initialInput = generateMock(z.CreateSpvInputSchema());
        const deleteInput = generateMock(z.DeleteSpvInputSchema());
        deleteInput.id = initialInput.id;
        const document = utils.createDocument({
            state: {
                global: {
                    spvs: [initialInput],
                },
                local: {},
            },
        });
        const updatedDocument = reducer(
            document,
            creators.deleteSpv(deleteInput),
        );

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe('DELETE_SPV');
        expect(updatedDocument.operations.global[0].input).toStrictEqual(
            deleteInput,
        );
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });
    it('should handle createServiceProviderFeeType operation', () => {
        const input = generateMock(z.CreateServiceProviderFeeTypeInputSchema());
        const existingAccount = generateMock(z.AccountSchema());
        input.accountId = existingAccount.id;
        const document = utils.createDocument({
            state: {
                global: {
                    accounts: [existingAccount],
                },
                local: {},
            },
        });
        const updatedDocument = reducer(
            document,
            creators.createServiceProviderFeeType(input),
        );

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe(
            'CREATE_SERVICE_PROVIDER_FEE_TYPE',
        );
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });
    it('should handle editServiceProviderFeeType operation', () => {
        const initialInput = generateMock(z.ServiceProviderFeeTypeSchema());
        const newInput = generateMock(
            z.EditServiceProviderFeeTypeInputSchema(),
        );
        newInput.id = initialInput.id;
        const existingAccount = generateMock(z.AccountSchema());
        newInput.accountId = existingAccount.id;
        const document = utils.createDocument({
            state: {
                global: {
                    serviceProviderFeeTypes: [initialInput],
                    accounts: [existingAccount],
                },
                local: {},
            },
        });
        const updatedDocument = reducer(
            document,
            creators.editServiceProviderFeeType(newInput),
        );

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe(
            'EDIT_SERVICE_PROVIDER_FEE_TYPE',
        );
        expect(updatedDocument.operations.global[0].input).toStrictEqual(
            newInput,
        );
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });
    it('should handle deleteServiceProviderFeeType operation', () => {
        const initialInput = generateMock(
            z.CreateServiceProviderFeeTypeInputSchema(),
        );
        const deleteInput = generateMock(
            z.DeleteServiceProviderFeeTypeInputSchema(),
        );
        deleteInput.id = initialInput.id;
        const document = utils.createDocument({
            state: {
                global: {
                    serviceProviderFeeTypes: [initialInput],
                },
                local: {},
            },
        });
        const updatedDocument = reducer(
            document,
            creators.deleteServiceProviderFeeType(deleteInput),
        );

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe(
            'DELETE_SERVICE_PROVIDER_FEE_TYPE',
        );
        expect(updatedDocument.operations.global[0].input).toStrictEqual(
            deleteInput,
        );
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });
    it('should handle createAccount operation', () => {
        const input = generateMock(z.CreateAccountInputSchema());
        const updatedDocument = reducer(
            document,
            creators.createAccount(input),
        );

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe(
            'CREATE_ACCOUNT',
        );
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });
    it('should handle editAccount operation', () => {
        const initialInput = generateMock(z.AccountSchema());
        const newInput = generateMock(z.EditAccountInputSchema());
        newInput.id = initialInput.id;
        const document = utils.createDocument({
            state: {
                global: {
                    accounts: [initialInput],
                },
                local: {},
            },
        });
        const updatedDocument = reducer(
            document,
            creators.editAccount(newInput),
        );

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe('EDIT_ACCOUNT');
        expect(updatedDocument.operations.global[0].input).toStrictEqual(
            newInput,
        );
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });
    it('should handle deleteAccount operation', () => {
        const initialInput = generateMock(z.AccountSchema());
        const deleteInput = generateMock(z.DeleteAccountInputSchema());
        deleteInput.id = initialInput.id;
        const document = utils.createDocument({
            state: {
                global: {
                    accounts: [initialInput],
                },
                local: {},
            },
        });
        const updatedDocument = reducer(
            document,
            creators.deleteAccount(deleteInput),
        );

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe(
            'DELETE_ACCOUNT',
        );
        expect(updatedDocument.operations.global[0].input).toStrictEqual(
            deleteInput,
        );
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });
});
