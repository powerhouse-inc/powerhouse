import { renderHook } from '@testing-library/react';
import { driveItem, treeItems } from '../mocks';
import { usePathContent } from './usePathContent';

/* eslint-disable */
const setItems = vi.fn();

vi.mock('../../../context/ItemsContext', () => ({
    useItemsContext: () => ({ items: treeItems, setItems }),
}));

describe('TreeView hooks', () => {
    describe('usePathContent', () => {
        it('should return drives nodes when no filterPath is not provided', () => {
            const { result } = renderHook(() => usePathContent());

            expect(result.current.length).toEqual(1);
            expect(result.current).toEqual([driveItem]);
        });

        it('should return nodes at the root level of the filterPath', () => {
            const driveNodes = renderHook(() => usePathContent('drive'));
            const folderNodes = renderHook(() =>
                usePathContent('drive/folder1/folder1.2'),
            );

            expect(driveNodes.result.current.length).toEqual(3);
            expect(driveNodes.result.current[0].id).toEqual('folder1');
            expect(driveNodes.result.current[1].id).toEqual('folder2');
            expect(driveNodes.result.current[2].id).toEqual('folder3');

            expect(folderNodes.result.current.length).toEqual(1);
            expect(folderNodes.result.current[0].id).toEqual(
                'folder1.2.1',
            );
        });

        it("should return an empty array when there's no results for the filterPath", () => {
            const { result } = renderHook(() =>
                usePathContent('/a/path/that/does/not/exist'),
            );

            expect(result.current.length).toEqual(0);
        });
    });
});
