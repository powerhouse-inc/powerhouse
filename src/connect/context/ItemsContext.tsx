import { BaseTreeItem, TreeItem, UITreeItem } from '@/connect';
import { createContext, useContext, useState } from 'react';

export interface TreeItemContext {
    items: TreeItem[];
    uiState: UITreeItemState;
    baseItems: BaseTreeItem[];
    virtualItems: BaseTreeItem[];
    setUIState: React.Dispatch<React.SetStateAction<UITreeItemState>>;
    setBaseItems: React.Dispatch<React.SetStateAction<BaseTreeItem[]>>;
    setVirtualItems: React.Dispatch<React.SetStateAction<BaseTreeItem[]>>;
    setItems: React.Dispatch<React.SetStateAction<BaseTreeItem[]>>;
}

const defaultTreeItemContextValue: TreeItemContext = {
    items: [],
    uiState: {},
    baseItems: [],
    virtualItems: [],
    setItems: () => {},
    setUIState: () => {},
    setBaseItems: () => {},
    setVirtualItems: () => {},
};

export const ItemsContext = createContext<TreeItemContext>(
    defaultTreeItemContextValue,
);

export interface ItemsContextProviderProps {
    children?: React.ReactNode;
    items?: BaseTreeItem[];
}

export type UITreeItemState = Record<string, UITreeItem | undefined>;

export const ItemsContextProvider: React.FC<ItemsContextProviderProps> = ({
    children,
    items: initialItems,
}) => {
    const [uiState, setUIState] = useState<UITreeItemState>({});
    const [virtualItems, setVirtualItems] = useState<Array<BaseTreeItem>>([]);
    const [baseItems, setBaseItems] = useState<Array<BaseTreeItem>>(
        initialItems || [],
    );

    const items = [...baseItems, ...virtualItems].map(item => ({
        ...item,
        ...uiState[item.id],
    }));

    return (
        <ItemsContext.Provider
            value={{
                items,
                uiState,
                baseItems,
                setUIState,
                virtualItems,
                setBaseItems,
                setVirtualItems,
                setItems: setBaseItems,
            }}
        >
            {children}
        </ItemsContext.Provider>
    );
};

export const useItemsContext = () => {
    const contextValue = useContext(ItemsContext);
    return contextValue;
};
