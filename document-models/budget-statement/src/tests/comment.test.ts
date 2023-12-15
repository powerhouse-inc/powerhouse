/**
* This is a scaffold file meant for customization: 
* - change it by adding new tests or modifying the existing ones
*/

import { generateMock } from '@acaldas/powerhouse';

import utils from '../../gen/utils';
import { z } from '../../gen/schema'; 
import { reducer } from '../../gen/reducer';
import * as creators from '../../gen/comment/creators';
import { BudgetStatementDocument } from '../../gen/types';


describe('Comment Operations', () => {
    let document: BudgetStatementDocument;

    beforeEach(() => {
        document = utils.createDocument();
    });

    it('should handle addComment operation', () => {
        const input = generateMock(z.AddCommentInputSchema());
        const updatedDocument = reducer(document, creators.addComment(input));

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe('ADD_COMMENT');
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

    it('should handle updateComment operation', () => {
        const input = generateMock(z.UpdateCommentInputSchema());
        const updatedDocument = reducer(document, creators.updateComment(input));

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe('UPDATE_COMMENT');
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

    it('should handle deleteComment operation', () => {
        const input = generateMock(z.DeleteCommentInputSchema());
        const updatedDocument = reducer(document, creators.deleteComment(input));

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe('DELETE_COMMENT');
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

});