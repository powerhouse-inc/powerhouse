---
to: "<%= rootDir %>/<%= h.changeCase.param(documentType) %>/src/tests/document-model.test.ts"
unless_exists: true
---
/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { describe, it, expect, beforeEach } from 'vitest';
import utils, { initialGlobalState, initialLocalState } from '../../gen/utils.js';

describe('<%= h.changeCase.title(documentType) %> Document Model', () => {
    it('should create a new <%= h.changeCase.title(documentType) %> document', () => {
        const document = utils.createDocument();

        expect(document).toBeDefined();
        expect(document.header.documentType).toBe('<%- documentTypeId %>');
    });

    it('should create a new <%= h.changeCase.title(documentType) %> document with a valid initial state', () => {
        const document = utils.createDocument();
        expect(document.state.global).toStrictEqual(initialGlobalState);
        expect(document.state.local).toStrictEqual(initialLocalState);
    });
});