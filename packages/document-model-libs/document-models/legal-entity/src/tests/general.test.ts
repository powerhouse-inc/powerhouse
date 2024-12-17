/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { generateMock } from '@powerhousedao/codegen';
import { utils as documentModelUtils } from 'document-model/document';

import utils from '../../gen/utils';
import {
    z,
    EditLegalEntityInput,
    EditLegalEntityBankInput,
    EditLegalEntityWalletInput,
} from '../../gen/schema';
import { reducer } from '../../gen/reducer';
import * as creators from '../../gen/general/creators';
import { LegalEntityDocument } from '../../gen/types';

describe('General Operations', () => {
    let document: LegalEntityDocument;

    beforeEach(() => {
        document = utils.createDocument();
    });

    it('should handle editLegalEntity operation', () => {
        // generate a random id
        // const id = documentModelUtils.hashKey();

        const input: EditLegalEntityInput = generateMock(
            z.EditLegalEntityInputSchema(),
        );

        const updatedDocument = reducer(
            document,
            creators.editLegalEntity(input),
        );

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe(
            'EDIT_LEGAL_ENTITY',
        );
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });
    it('should handle editLegalEntityBank operation', () => {
        // generate a random id
        // const id = documentModelUtils.hashKey();

        const input: EditLegalEntityBankInput = generateMock(
            z.EditLegalEntityBankInputSchema(),
        );

        const updatedDocument = reducer(
            document,
            creators.editLegalEntityBank(input),
        );

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe(
            'EDIT_LEGAL_ENTITY_BANK',
        );
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });
    it('should handle editLegalEntityWallet operation', () => {
        // generate a random id
        // const id = documentModelUtils.hashKey();

        const input: EditLegalEntityWalletInput = generateMock(
            z.EditLegalEntityWalletInputSchema(),
        );

        const updatedDocument = reducer(
            document,
            creators.editLegalEntityWallet(input),
        );

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe(
            'EDIT_LEGAL_ENTITY_WALLET',
        );
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });
});
