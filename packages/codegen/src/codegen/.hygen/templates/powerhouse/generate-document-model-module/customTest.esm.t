---
to: "<%= rootDir %>/<%= h.changeCase.param(documentType) %>/src/tests/<%= module %>.test.ts"
unless_exists: true
---
/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { generateMock } from '@powerhousedao/codegen';
import { utils as documentModelUtils } from 'document-model';

import utils from '../../gen/utils.js';
import {
    z,
<% actions.forEach(action => { _%>
    <%= 'type ' + h.changeCase.pascal(action.name) %>Input,
<% }); _%> 
} from '../../gen/schema/index.js';
import { reducer } from '../../gen/reducer.js';
import * as creators from '../../gen/<%= module %>/creators.js';
import { <%= h.changeCase.pascal(documentType) %>Document } from '../../gen/types.js';

describe('<%= h.changeCase.pascal(module) %> Operations', () => {
    let document: <%= h.changeCase.pascal(documentType) %>Document;

    beforeEach(() => {
        document = utils.createDocument();
    });

<% actions.forEach(action => { _%>
    it('should handle <%= h.changeCase.camel(action.name) %> operation', () => {
        // generate a random id
        // const id = documentModelUtils.hashKey();

        const input: <%= h.changeCase.pascal(action.name) %>Input = generateMock(
            z.<%= h.changeCase.pascal(action.name) %>InputSchema(),
        );

        const updatedDocument = reducer(
            document,
            creators.<%= h.changeCase.camel(action.name) %>(input),
        );

        expect(updatedDocument.operations.<%= action.scope %>).toHaveLength(1);
        expect(updatedDocument.operations.<%= action.scope %>[0].type).toBe(
            '<%= h.changeCase.constant(action.name) %>',
        );
        expect(updatedDocument.operations.<%= action.scope %>[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.<%= action.scope %>[0].index).toEqual(0);
    });
<% }); _%> 
});
