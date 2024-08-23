import { documentModel } from 'document-model-libs/document-drive';
import { describe, it } from 'vitest';
import { generateDocumentStateQuery } from '../src/utils/graphql';

describe('Graphql methods', () => {
    it('should generate document drive query', ({ expect }) => {
        const schema = generateDocumentStateQuery(documentModel);
        expect(schema).toEqual(
            '... on DocumentDrive { state { id name nodes { ... on FolderNode { id name kind parentFolder } ... on FileNode { id name kind documentType parentFolder synchronizationUnits { syncId scope branch } } } icon slug }'
        );
    });
});
