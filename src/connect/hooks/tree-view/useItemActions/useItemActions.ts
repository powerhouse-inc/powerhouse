import { ActionType, TreeItem } from '@/connect/components/tree-view-item';
import { useItemsContext, UITreeItemState } from '@/connect/context/ItemsContext';

export const useItemActions = () => {
    const { setUIState, setVirtualItems, baseItems } = useItemsContext();
    
    /**
     * Sets the item as selected in the UI state.
     * @param itemID - The ID of the item to be selected.
     */
    const setSelectedItem = (itemID: string) => {
        setUIState((prevState) => {
            const uiValues = Object
                .entries(prevState)
                .reduce<UITreeItemState>((acc, entry) => {
                    const [key, value] = entry;
                    const uiState = {
                        ...acc,
                        [key]: { ...value, isSelected: false },
                    };

                    return uiState;
                }, {});

            const newItemState = {
                [itemID]: {
                    ...prevState[itemID],
                    isSelected: true,
                },
            };

            return { ...uiValues, ...newItemState };
        });
    };

    /**
     * Sets the item as expanded in the UI state.
     * @param itemID - The ID of the item.
     * @param expanded - The expanded state to set (default: true).
     */
    const setExpandedItem = (itemID: string, expanded = true) => {
        setUIState((prevState) => ({
            ...prevState,
            [itemID]: {
                ...prevState[itemID],
                expanded,
            },
        }));
    };

    /**
     * Toggles the expanded state of an item and selects it.
     * 
     * @param itemID - The ID of the item to toggle and select.
     */
    const toggleExpandedAndSelect = (itemID: string) => {
        const baseItemExpanded = baseItems.find((item) => item.id === itemID)?.expanded || false;

        setUIState((prevState) => {
            const uiValues = Object
                .entries(prevState)
                .reduce<UITreeItemState>((acc, entry) => {
                    const [key, value] = entry;
                    const uiState = {
                        ...acc,
                        [key]: {
                            ...value,
                            isSelected: false,
                        },
                    };

                    return uiState;
                }, {});


            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            const newExpandedState = !(prevState[itemID]?.expanded ?? baseItemExpanded)
            const newItemState = {
                [itemID]: {
                    ...prevState[itemID],
                    isSelected: true,
                    expanded: newExpandedState,
                },
            };

            return { ...uiValues, ...newItemState };
        });
    };

    /**
     * Adds a new virtual item to the TreeItems state.
     * 
     * @param virtualItem - The virtual item to be added.
     */
    const newVirtualItem = (virtualItem: TreeItem) => {
        const { action, expanded, isSelected, ...baseVirtualItem } = virtualItem;

        setVirtualItems((prevState) => [...prevState, baseVirtualItem]);
        setUIState((prevState) => ({
            ...prevState,
            [virtualItem.id]: {
                action,
                expanded,
                isSelected,
            },
        }));
    };

    /**
     * Deletes a virtual item from the state based on its ID.
     * @param itemID - The ID of the item to be deleted.
     */
    const deleteVirtualItem = (itemID: string) => {
        setVirtualItems((prevState) => prevState.filter((item) => item.id !== itemID));
        setUIState((prevState) => {
            const newUIState = Object.entries(prevState)
                .filter(([key]) => key !== itemID)
                .reduce<UITreeItemState>((acc, [key, value]) => {
                    return {
                        ...acc,
                        [key]: value,
                    };
                }, {});

            return newUIState;
        });
    };

    /**
     * Sets the action type for a specific item.
     * @param itemID - The ID of the item.
     * @param actionType - The type of action to be set. If not provided or null, the action will be undefined.
     */
    const setItemAction = (itemID: string, actionType?: ActionType | null) => {
        setUIState((prevState) => {
            const itemState = {
                ...prevState[itemID],
                action: actionType || undefined,
            };

            return {
                ...prevState,
                [itemID]: itemState,
            };
        });
    };

    return {
        setItemAction,
        newVirtualItem,
        setExpandedItem,
        setSelectedItem,
        deleteVirtualItem,
        toggleExpandedAndSelect,
    };
};

export default useItemActions;
