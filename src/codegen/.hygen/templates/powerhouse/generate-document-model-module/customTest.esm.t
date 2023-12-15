---
to: "<%= rootDir %>/<%= h.changeCase.param(documentType) %>/src/tests/<%= module %>.test.ts"
unless_exists: true
---
/**
* This is a scaffold file meant for customization: 
* - change it by adding new tests or modifying the existing ones
*/

import { generateMock } from '@acaldas/powerhouse';

import utils from '../../gen/utils';
import { z } from '../../gen/schema'; 
import { reducer } from '../../gen/reducer';
import * as creators from '../../gen/<%= module %>/creators';
import { <%= h.changeCase.pascal(documentType) %>Document } from '../../gen/types';


describe('<%= h.changeCase.pascal(module) %> Operations', () => {
    let document: <%= h.changeCase.pascal(documentType) %>Document;

    beforeEach(() => {
        document = utils.createDocument();
    });

<% actions.forEach(action => { _%>
    it('should handle <%= h.changeCase.camel(action.name) %> operation', () => {
        const input = generateMock(z.<%= h.changeCase.pascal(action.name) %>InputSchema());
        const updatedDocument = reducer(document, creators.<%= h.changeCase.camel(action.name) %>(input));

        expect(updatedDocument.operations.<%= action.scope %>).toHaveLength(1);
        expect(updatedDocument.operations.<%= action.scope %>[0].type).toBe('<%= h.changeCase.constant(action.name) %>');
        expect(updatedDocument.operations.<%= action.scope %>[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.<%= action.scope %>[0].index).toEqual(0);
    });

<% }); _%> 
});