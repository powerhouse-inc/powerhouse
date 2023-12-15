/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { generateMock } from '@acaldas/powerhouse';

import utils from '../../gen/utils';
import { z } from '../../gen/schema';
import { reducer } from '../../gen/reducer';
import * as creators from '../../gen/main/creators';
import { ScopeFrameworkDocument } from '../../gen/types';

describe('Main Operations', () => {
    let document: ScopeFrameworkDocument;

    beforeEach(() => {
        document = utils.createDocument();
    });

    it('should handle setRootPath operation', () => {
        const input = { newRootPath: 'A' };
        const updatedDocument = reducer(document, creators.setRootPath(input));

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe('SET_ROOT_PATH');
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

    it('should handle addElement operation', () => {
        const input = generateMock(z.AddElementInputSchema());
        const updatedDocument = reducer(document, creators.addElement(input));

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe('ADD_ELEMENT');
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

    it('should handle updateElementType operation', () => {
        const input = generateMock(z.UpdateElementTypeInputSchema());
        const updatedDocument = reducer(
            document,
            creators.updateElementType(input),
        );

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe(
            'UPDATE_ELEMENT_TYPE',
        );
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

    it('should handle updateElementName operation', () => {
        const input = generateMock(z.UpdateElementNameInputSchema());
        const updatedDocument = reducer(
            document,
            creators.updateElementName(input),
        );

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe(
            'UPDATE_ELEMENT_NAME',
        );
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

    it('should handle updateElementComponents operation', () => {
        const input = generateMock(z.UpdateElementComponentsInputSchema());
        const updatedDocument = reducer(
            document,
            creators.updateElementComponents(input),
        );

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe(
            'UPDATE_ELEMENT_COMPONENTS',
        );
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

    it('should handle removeElement operation', () => {
        const input = generateMock(z.RemoveElementInputSchema());
        const updatedDocument = reducer(
            document,
            creators.removeElement(input),
        );

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe(
            'REMOVE_ELEMENT',
        );
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

    it('should handle reorderElements operation', () => {
        const input = generateMock(z.ReorderElementsInputSchema());
        const updatedDocument = reducer(
            document,
            creators.reorderElements(input),
        );

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe(
            'REORDER_ELEMENTS',
        );
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

    it('should handle moveElement operation', () => {
        const input = generateMock(z.MoveElementInputSchema());
        const updatedDocument = reducer(document, creators.moveElement(input));

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe('MOVE_ELEMENT');
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });
});
