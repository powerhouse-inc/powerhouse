import { renderHook } from '@testing-library/react';
import { driveItem, treeItems } from '../mocks';
import { useGetDriveParent } from './useGetDriveParent';

/* eslint-disable */
const setItems = jest.fn();

jest.mock('../../../context/ItemsContext', () => ({
    useItemsContext: () => ({ items: treeItems, setItems }),
}));

describe('TreeView hooks', () => {
    describe('useGetDriveParent', () => {
        it('should return drive parent item when is found', () => {
            const { result } = renderHook(() => useGetDriveParent());
            const getDriveParent = result.current;

            expect(getDriveParent('drive/folder2/folder2.1')).toEqual(
                driveItem,
            );
            expect(getDriveParent('drive/folder1')).toEqual(driveItem);
            expect(getDriveParent('/drive/folder1')).toEqual(driveItem);
            expect(getDriveParent('/drive/folder1/')).toEqual(driveItem);
        });

        it('should return undefined when drive parent item is not found', () => {
            const { result } = renderHook(() => useGetDriveParent());
            const getDriveParent = result.current;

            expect(getDriveParent('drive2/folder3')).toBeUndefined();
            expect(getDriveParent('/folder3')).toBeUndefined();
            expect(getDriveParent('/drive3/folder3/')).toBeUndefined();
        });
    });
});
