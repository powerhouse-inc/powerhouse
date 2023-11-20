import { renderHook } from '@testing-library/react';
import { treeItems } from '../mocks';
import { useItemActions } from './useItemActions';
import { TreeItemContext } from '@/connect/context/ItemsContext';
import { ItemType, ActionType } from '@/connect/components/tree-view-item';

/* eslint-disable */
const baseItem = {
    id: 'base-item',
    expanded: true,
    path: 'drive-id/base-item',
    label: 'Base Item',
    type: ItemType.Folder
};

const setItems = jest.fn();
const setUIState = jest.fn();
const setBaseItems = jest.fn();
const setVirtualItems = jest.fn();
const uiState: TreeItemContext['uiState'] = {};
const baseItems: TreeItemContext['baseItems'] = [baseItem];
const virtualItems: TreeItemContext['virtualItems'] = [];

const useItemsContextReturnValue = {
    items: treeItems,
    setItems,
    uiState,
    baseItems,
    setUIState,
    setBaseItems,
    virtualItems,
    setVirtualItems,
};

jest.mock('../../../context/ItemsContext', () => ({
    useItemsContext: () => useItemsContextReturnValue,
}));

describe('TreeView hooks', () => {
    describe('useItemActions', () => {
        
        beforeEach(() => {
            setItems.mockClear();
            setUIState.mockClear();
            setBaseItems.mockClear();
            setVirtualItems.mockClear();
        });

        describe('setSelectedItem', () => {
            it('should call setUIState when setSelectedItem is called', () => {
                const { result } = renderHook(() => useItemActions());

                result.current.setSelectedItem(treeItems[1].id);

                expect(setUIState).toHaveBeenCalled();
                expect(setUIState).toHaveBeenCalledTimes(1);
            });

            it("should create a new uiState with isSelected=true when there's no state for the current item", () => {
                const { result } = renderHook(() => useItemActions());
                const itemID = treeItems[1].id;

                result.current.setSelectedItem(itemID);
                const [setUIStateCallback] = setUIState.mock.calls[0];
                const newState = setUIStateCallback(uiState);

                expect(newState).toEqual({
                    [itemID]: { isSelected: true },
                });
            });

            it('should select only the current item when there are other items selected', () => {
                const { result } = renderHook(() => useItemActions());
                const itemID = treeItems[1].id;

                result.current.setSelectedItem(itemID);
                const [setUIStateCallback] = setUIState.mock.calls[0];
                const newState = setUIStateCallback({
                    'other-item': { isSelected: true },
                });

                expect(newState).toEqual({
                    [itemID]: { isSelected: true },
                    'other-item': { isSelected: false },
                });
            });

            it('should not change another property besides isSelected', () => {
                const { result } = renderHook(() => useItemActions());
                const itemID = treeItems[1].id;

                result.current.setSelectedItem(itemID);
                const [setUIStateCallback] = setUIState.mock.calls[0];
                const newState = setUIStateCallback({
                    [itemID]: { isSelected: false, expanded: true },
                });

                expect(newState).toEqual({
                    [itemID]: { isSelected: true, expanded: true },
                });
            });

            it('should not change another item state properties besides isSelected', () => {
                const { result } = renderHook(() => useItemActions());
                const itemID = treeItems[1].id;

                result.current.setSelectedItem(itemID);
                const [setUIStateCallback] = setUIState.mock.calls[0];
                const newState = setUIStateCallback({
                    'other-item': { isSelected: true, expanded: true },
                    'other-item2': { isSelected: false, expanded: false },
                    [itemID]: { isSelected: false, expanded: true },
                });

                expect(newState).toEqual({
                    [itemID]: { isSelected: true, expanded: true },
                    'other-item2': { isSelected: false, expanded: false },
                    'other-item': { isSelected: false, expanded: true },
                });
            });
        });

        describe('setExpandedItem', () => {
            it('should call setUIState when setExpandedItem is called', () => {
                const { result } = renderHook(() => useItemActions());

                result.current.setExpandedItem(treeItems[1].id);

                expect(setUIState).toHaveBeenCalled();
                expect(setUIState).toHaveBeenCalledTimes(1);
            });

            it('should create a new uiState with expanded=true when there is no state for the current item', () => {
                const { result } = renderHook(() => useItemActions());
                const itemID = treeItems[1].id;

                result.current.setExpandedItem(itemID);
                const [setUIStateCallback] = setUIState.mock.calls[0];
                const newState = setUIStateCallback(uiState);

                expect(newState).toEqual({
                    [itemID]: { expanded: true },
                });
            });

            it('should set expanded=true when the item is not expanded', () => {
                const { result } = renderHook(() => useItemActions());
                const itemID = treeItems[1].id;

                result.current.setExpandedItem(itemID);
                const [setUIStateCallback] = setUIState.mock.calls[0];
                const newState = setUIStateCallback({
                    [itemID]: { expanded: false },
                });

                expect(newState).toEqual({
                    [itemID]: { expanded: true },
                });
            });

            it('should set expanded with arg value', () => {
                const { result } = renderHook(() => useItemActions());
                const itemID = treeItems[1].id;

                result.current.setExpandedItem(itemID, false);
                const [setUIStateCallback] = setUIState.mock.calls[0];
                const newState = setUIStateCallback({
                    [itemID]: { expanded: true },
                });

                expect(newState).toEqual({
                    [itemID]: { expanded: false },
                });
            });

            it('should not change another property besides expanded', () => {
                const { result } = renderHook(() => useItemActions());
                const itemID = treeItems[1].id;

                result.current.setExpandedItem(itemID);
                const [setUIStateCallback] = setUIState.mock.calls[0];
                const newState = setUIStateCallback({
                    [itemID]: { expanded: false, isSelected: false },
                });

                expect(newState).toEqual({
                    [itemID]: { expanded: true, isSelected: false },
                });
            });

            it('should not change another item state properties besides expanded', () => {
                const { result } = renderHook(() => useItemActions());
                const itemID = treeItems[1].id;

                result.current.setExpandedItem(itemID);
                const [setUIStateCallback] = setUIState.mock.calls[0];
                const newState = setUIStateCallback({
                    'other-item': { expanded: true, isSelected: true },
                    'other-item2': { expanded: false, isSelected: false },
                    [itemID]: { expanded: false, isSelected: false },
                });

                expect(newState).toEqual({
                    'other-item': { expanded: true, isSelected: true },
                    'other-item2': { expanded: false, isSelected: false },
                    [itemID]: { expanded: true, isSelected: false },
                });
            });
        });

        describe('toggleExpandedAndSelect', () => {
            it('should call setUIState when toggleExpandedAndSelect is called', () => {
                const { result } = renderHook(() => useItemActions());

                result.current.toggleExpandedAndSelect(treeItems[0].id);

                expect(setUIState).toHaveBeenCalled();
                expect(setUIState).toHaveBeenCalledTimes(1);
            });

            it('should create a new uiState with isSelected=true and expanded=true when there is no state for the current item', () => {
                const { result } = renderHook(() => useItemActions());
                const itemID = treeItems[1].id;

                result.current.toggleExpandedAndSelect(itemID);
                const [setUIStateCallback] = setUIState.mock.calls[0];
                const newState = setUIStateCallback(uiState);

                expect(newState).toEqual({
                    [itemID]: { isSelected: true, expanded: true },
                });
            });

            it('should set isSelected=true and expanded=true when the item is not expanded and not selected', () => {
                const { result } = renderHook(() => useItemActions());
                const itemID = treeItems[1].id;

                result.current.toggleExpandedAndSelect(itemID);
                const [setUIStateCallback] = setUIState.mock.calls[0];
                const newState = setUIStateCallback({
                    [itemID]: { isSelected: false, expanded: false },
                });

                expect(newState).toEqual({
                    [itemID]: { isSelected: true, expanded: true },
                });
            });

            it('should set isSelected=true and expanded=false when the item is expanded and selected', () => {
                const { result } = renderHook(() => useItemActions());
                const itemID = treeItems[1].id;

                result.current.toggleExpandedAndSelect(itemID);
                const [setUIStateCallback] = setUIState.mock.calls[0];
                const newState = setUIStateCallback({
                    [itemID]: { isSelected: true, expanded: true },
                });

                expect(newState).toEqual({
                    [itemID]: { isSelected: true, expanded: false },
                });
            });

            it('should set isSelected=true and expanded=true when the item is not expanded and selected', () => {
                const { result } = renderHook(() => useItemActions());
                const itemID = treeItems[1].id;

                result.current.toggleExpandedAndSelect(itemID);
                const [setUIStateCallback] = setUIState.mock.calls[0];
                const newState = setUIStateCallback({
                    [itemID]: { isSelected: true, expanded: false },
                });

                expect(newState).toEqual({
                    [itemID]: { isSelected: true, expanded: true },
                });
            });

            it('should change isSelected=false for other items', () => {
                const { result } = renderHook(() => useItemActions());
                const itemID = treeItems[1].id;
                const itemID1 = 'itemID1';
                const itemID2 = 'itemID2';

                result.current.toggleExpandedAndSelect(itemID);
                const [setUIStateCallback] = setUIState.mock.calls[0];
                const newState = setUIStateCallback({
                    [itemID1]: { isSelected: true, expanded: true },
                    [itemID2]: { isSelected: true, expanded: false },
                });

                expect(newState).toEqual({
                    [itemID1]: { isSelected: false, expanded: true },
                    [itemID2]: { isSelected: false, expanded: false },
                    [itemID]: { isSelected: true, expanded: true },
                });
            });

            it('should not change another property besides isSelected and expanded', () => {
                const { result } = renderHook(() => useItemActions());
                const itemID = treeItems[1].id;

                result.current.toggleExpandedAndSelect(itemID);
                const [setUIStateCallback] = setUIState.mock.calls[0];
                const newState = setUIStateCallback({
                    [itemID]: { isSelected: false, expanded: false, otherProp: true },
                });

                expect(newState).toEqual({
                    [itemID]: { isSelected: true, expanded: true, otherProp: true },
                });
            });

            it('should not change another item state properties besides isSelected and expanded', () => {
                const { result } = renderHook(() => useItemActions());
                const itemID = treeItems[1].id;
                const itemID1 = 'itemID1';
                const itemID2 = 'itemID2';

                result.current.toggleExpandedAndSelect(itemID);
                const [setUIStateCallback] = setUIState.mock.calls[0];
                const newState = setUIStateCallback({
                    [itemID1]: { isSelected: true, expanded: true, otherProp: true },
                    [itemID2]: { isSelected: false, expanded: false, otherProp: false },
                    [itemID]: { isSelected: false, expanded: false, otherProp: false },
                });

                expect(newState).toEqual({
                    [itemID1]: { isSelected: false, expanded: true, otherProp: true },
                    [itemID2]: { isSelected: false, expanded: false, otherProp: false },
                    [itemID]: { isSelected: true, expanded: true, otherProp: false },
                });
            });

            it('should use baseItem expanded value as fallback when is available', () => {
                const itemID = baseItem.id;
                const { result } = renderHook(() => useItemActions());

                result.current.toggleExpandedAndSelect(itemID);
                const [setUIStateCallback] = setUIState.mock.calls[0];
                const newState = setUIStateCallback({});

                expect(newState).toEqual({
                    [itemID]: { isSelected: true, expanded: false },
                });
            });

            it('should use uiState expanded value even when baseItem expanded is available', () => {
                const itemID = baseItem.id;

                const { result } = renderHook(() => useItemActions());
                result.current.toggleExpandedAndSelect(itemID);
                const [setUIStateCallback] = setUIState.mock.calls[0];
                const newState = setUIStateCallback({
                    [itemID]: { expanded: false },
                });

                expect(newState).toEqual({
                    [itemID]: { isSelected: true, expanded: true },
                });
            });
        });
        
        describe('setItemAction', () => {
            it('should call setUIState when setItemAction is called', () => {
                const { result } = renderHook(() => useItemActions());

                result.current.setItemAction(treeItems[0].id, null);

                expect(setUIState).toHaveBeenCalled();
                expect(setUIState).toHaveBeenCalledTimes(1);
            });

            it('should create a new uiState with action when there is no state for the current item', () => {
                const { result } = renderHook(() => useItemActions());
                const itemID = treeItems[1].id;
                const action = ActionType.Update;

                result.current.setItemAction(itemID, action);
                const [setUIStateCallback] = setUIState.mock.calls[0];
                const newState = setUIStateCallback(uiState);

                expect(newState).toEqual({
                    [itemID]: { action },
                });
            });

            it('should update item action', () => {
                const { result } = renderHook(() => useItemActions());
                const itemID = treeItems[1].id;
                const action = ActionType.Update;

                result.current.setItemAction(itemID, action);
                const [setUIStateCallback] = setUIState.mock.calls[0];
                const newState = setUIStateCallback({
                    [itemID]: { action: ActionType.New },
                });

                expect(newState).toEqual({
                    [itemID]: { action },
                });
            });

            it('should remove item action when action is null', () => {
                const { result } = renderHook(() => useItemActions());
                const itemID = treeItems[1].id;

                result.current.setItemAction(itemID, null);
                const [setUIStateCallback] = setUIState.mock.calls[0];
                const newState = setUIStateCallback({
                    [itemID]: { action: ActionType.New },
                });

                expect(newState).toEqual({
                    [itemID]: { action: undefined },
                });
            });

            it('should remove item action when action is undefined', () => {
                const { result } = renderHook(() => useItemActions());
                const itemID = treeItems[1].id;

                result.current.setItemAction(itemID, undefined);
                const [setUIStateCallback] = setUIState.mock.calls[0];
                const newState = setUIStateCallback({
                    [itemID]: { action: ActionType.New },
                });

                expect(newState).toEqual({
                    [itemID]: { action: undefined },
                });
            });

            it('should not change another property besides action', () => {
                const { result } = renderHook(() => useItemActions());
                const itemID = treeItems[1].id;
                const action = ActionType.Update;

                result.current.setItemAction(itemID, action);
                const [setUIStateCallback] = setUIState.mock.calls[0];
                const newState = setUIStateCallback({
                    [itemID]: { isSelected: false },
                });

                expect(newState).toEqual({
                    [itemID]: { action, isSelected: false },
                });
            });

            it('should not change another item state properties', () => {
                const { result } = renderHook(() => useItemActions());
                const itemID = treeItems[1].id;
                const action = ActionType.Update;

                result.current.setItemAction(itemID, action);
                const [setUIStateCallback] = setUIState.mock.calls[0];
                const newState = setUIStateCallback({
                    'other-item': { action: ActionType.New, isSelected: true },
                    'other-item2': { isSelected: false },
                    [itemID]: { action: ActionType.New, isSelected: false },
                });

                expect(newState).toEqual({
                    'other-item': { action: ActionType.New, isSelected: true },
                    'other-item2': { isSelected: false },
                    [itemID]: { action, isSelected: false },
                });
            });
        });

        describe('newVirtualItem', () => {
            it('should call setVirtualItems and setUIState when newVirtualItem is called', () => {
                const { result } = renderHook(() => useItemActions());

                result.current.newVirtualItem(baseItem);

                expect(setVirtualItems).toHaveBeenCalled();
                expect(setVirtualItems).toHaveBeenCalledTimes(1);
                expect(setUIState).toHaveBeenCalled();
                expect(setUIState).toHaveBeenCalledTimes(1);
            });

            it('should create a new virtual item', () => {
                const { result } = renderHook(() => useItemActions());
                const { expanded, ...virtualItem } = baseItem;

                result.current.newVirtualItem(baseItem);
                const [setVirtualItemsCallback] = setVirtualItems.mock.calls[0];
                const [setUIStateCallback] = setUIState.mock.calls[0];
                const newVirtualItems = setVirtualItemsCallback([]);
                const newUIState = setUIStateCallback({});

                expect(newVirtualItems).toEqual([virtualItem]);
                expect(newUIState).toEqual({
                    [baseItem.id]: { expanded }
                });
            });
        });

        describe('deleteVirtualItem', () => {
            it('should call setVirtualItems and setUIState when deleteVirtualItem is called', () => {
                const { result } = renderHook(() => useItemActions());

                result.current.deleteVirtualItem(baseItem.id);

                expect(setVirtualItems).toHaveBeenCalled();
                expect(setVirtualItems).toHaveBeenCalledTimes(1);
                expect(setUIState).toHaveBeenCalled();
                expect(setUIState).toHaveBeenCalledTimes(1);
            });

            it('should delete virtual item', () => {
                const { result } = renderHook(() => useItemActions());
                const { expanded, ...virtualItem } = baseItem;

                result.current.newVirtualItem(baseItem);
                result.current.deleteVirtualItem(baseItem.id);
                const [setVirtualItemsCallback] = setVirtualItems.mock.calls[1];
                const [setUIStateCallback] = setUIState.mock.calls[1];
                const newVirtualItems = setVirtualItemsCallback([virtualItem, { ...virtualItem, id: 'other-item' }]);
                const newUIState = setUIStateCallback({
                    [baseItem.id]: { expanded },
                    'other-item': { expanded: true },
                });

                expect(newVirtualItems).toEqual([{ ...virtualItem, id: 'other-item' }]);
                expect(newUIState).toEqual({
                    'other-item': { expanded: true },
                });
            });
        });
    });
});
