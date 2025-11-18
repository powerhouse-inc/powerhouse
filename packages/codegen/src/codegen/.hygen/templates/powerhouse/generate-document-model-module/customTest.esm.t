---
to: "<%= rootDir %>/<%= h.changeCase.param(documentType) %>/src/tests/<%= module %>.test.ts"
unless_exists: true
---
/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { describe, it, expect } from 'vitest';
import { generateMock } from '@powerhousedao/codegen';
import {
  reducer,
  utils,
  <%= isPhDocumentOfTypeFunctionName %>,
  <% actions.forEach(action => { _%>
    <%= h.changeCase.camel(action.name) %>,
    <%= h.changeCase.pascal(action.name) %>InputSchema,
<% }); _%> 
} from "<%= documentModelDir %>";

describe('<%= h.changeCase.pascal(module) %> Operations', () => {
<% actions.forEach(action => { _%>
    it('should handle <%= h.changeCase.camel(action.name) %> operation', () => {
        const document = utils.createDocument();
        const input = generateMock(
            <%= h.changeCase.pascal(action.name) %>InputSchema(),
        );

        const updatedDocument = reducer(
            document,
            <%= h.changeCase.camel(action.name) %>(input),
        );

        expect(<%= isPhDocumentOfTypeFunctionName %>(updatedDocument)).toBe(true);
        expect(updatedDocument.operations.<%= action.scope %>).toHaveLength(1);
        expect(updatedDocument.operations.<%= action.scope %>[0].action.type).toBe(
            '<%= h.changeCase.constant(action.name) %>',
        );
        expect(updatedDocument.operations.<%= action.scope %>[0].action.input).toStrictEqual(input);
        expect(updatedDocument.operations.<%= action.scope %>[0].index).toEqual(0);
    });
<% }); _%> 
});
