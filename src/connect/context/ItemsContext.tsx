import { TreeItem } from '@/connect/components/tree-view-item';
import React, { useContext, useState } from 'react';

interface TreeItemContext {
    items: TreeItem[];
    setItems: React.Dispatch<React.SetStateAction<TreeItem[]>>;
}

const defaultTreeItemContextValue: TreeItemContext = {
    items: [],
    setItems: () => {},
};

export const ItemsContext = React.createContext<TreeItemContext>(
    defaultTreeItemContextValue,
);

export interface ItemsContextProviderProps {
    children?: React.ReactNode;
    items?: TreeItem[];
}

export const ItemsContextProvider: React.FC<ItemsContextProviderProps> = ({
    children,
    items: initialItems,
}) => {
    const [items, setItems] = useState<TreeItem[]>(
        initialItems || defaultTreeItemContextValue.items,
    );

    return (
        <ItemsContext.Provider value={{ items, setItems }}>
            {children}
        </ItemsContext.Provider>
    );
};

export const useItemsContext = () => {
    const contextValue = useContext(ItemsContext);
    return contextValue;
};
