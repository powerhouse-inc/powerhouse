/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { generateMock } from '@powerhousedao/codegen';
import * as creators from '../../gen/node/creators';
import { reducer } from '../../gen/reducer';
import { z } from '../../gen/schema';
import { DocumentDriveDocument } from '../../gen/types';
import utils from '../../gen/utils';

describe('Node Operations', () => {
    let document: DocumentDriveDocument;

    beforeEach(() => {
        document = utils.createDocument();
    });

    it('should handle addFile operation', () => {
        const input = generateMock(z.AddFileInputSchema());
        const updatedDocument = reducer(document, creators.addFile(input));

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe('ADD_FILE');
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

    it('should handle addFolder operation', () => {
        const input = generateMock(z.AddFolderInputSchema());
        const updatedDocument = reducer(document, creators.addFolder(input));

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe('ADD_FOLDER');
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

    it('should handle deleteNode operation', () => {
        const input = generateMock(z.DeleteNodeInputSchema());
        const document = utils.createDocument({
            state: {
                global: {
                    // @ts-expect-error mock
                    nodes: [input],
                },
            },
        });
        const updatedDocument = reducer(document, creators.deleteNode(input));

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe('DELETE_NODE');
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

    it('should handle updateFile operation', () => {
        const input = generateMock(z.UpdateFileInputSchema());
        const updatedDocument = reducer(document, creators.updateFile(input));

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe('UPDATE_FILE');
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

    it('should handle updateNode operation', () => {
        const input = generateMock(z.UpdateNodeInputSchema());
        const updatedDocument = reducer(document, creators.updateNode(input));

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe('UPDATE_NODE');
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

    it('should handle copyNode operation', () => {
        const input = generateMock(z.CopyNodeInputSchema());
        const document = utils.createDocument({
            state: {
                global: {
                    nodes: [
                        // @ts-expect-error mock
                        {
                            id: input.srcId,
                            name: 'Node 1',
                        },
                        // @ts-expect-error mock
                        {
                            id: input.targetId,
                            name: 'Node 2',
                        },
                    ],
                },
            },
        });
        const updatedDocument = reducer(document, creators.copyNode(input));

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe('COPY_NODE');
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

    it('should handle moveNode operation', () => {
        const input = generateMock(z.MoveNodeInputSchema());
        const document = utils.createDocument({
            state: {
                global: {
                    nodes: [
                        // @ts-expect-error mock
                        {
                            id: input.srcFolder,
                            name: 'Node 1',
                        },
                        {
                            // @ts-expect-error mock
                            id: input.targetParentFolder,
                            name: 'Node 2',
                        },
                    ],
                },
            },
        });
        const updatedDocument = reducer(document, creators.moveNode(input));

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe('MOVE_NODE');
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });
    it('should not allow moving folder to descendent', () => {
        // Mock data setup
        const nodes = [
            { id: '1', parentFolder: null, kind: 'folder', name: 'Root' },
            { id: '2', parentFolder: '1', kind: 'folder', name: 'Child' },
            { id: '3', parentFolder: '2', kind: 'folder', name: 'Subchild' },
        ];

        document.state.global.nodes = nodes;

        // move folder to descendent
        expect(() => {
            reducer(
                document,
                creators.moveNode({
                    srcFolder: '1',
                    targetParentFolder: '3',
                }),
            );
        }).toThrowError('Cannot move a folder to one of its descendants');
    });
    it('should not allow making folder its own parent', () => {
        // Mock data setup
        const nodes = [
            { id: '1', parentFolder: null, kind: 'folder', name: 'Root' },
            { id: '2', parentFolder: '1', kind: 'folder', name: 'Child' },
            { id: '3', parentFolder: '2', kind: 'folder', name: 'Subchild' },
        ];

        document.state.global.nodes = nodes;

        expect(() => {
            reducer(
                document,
                creators.moveNode({
                    srcFolder: '1',
                    targetParentFolder: '1',
                }),
            );
        }).toThrowError('Cannot make folder its own parent');
    });
});
