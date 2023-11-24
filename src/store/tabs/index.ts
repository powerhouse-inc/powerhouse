import type { Document } from 'document-model/document';
import { atom, useAtom } from 'jotai';
import { useMemo } from 'react';
import { ListData } from 'react-stately';
import { useDocumentModels, useGetDocumentModel } from '../document-model';
import { useGetEditor } from '../editor';
import { Tab, createTab } from './base';
export * from './base';

function moveTab(tabs: Tab[], indices: number[], toIndex: number): Tab[] {
    // Shift the target down by the number of items being moved from before the target
    toIndex -= indices.filter(index => index < toIndex).length;

    const moves = indices.map(from => ({
        from,
        to: toIndex++,
    }));

    // Shift later from indices down if they have a larger index
    for (let i = 0; i < moves.length; i++) {
        const a = moves[i].from;
        for (let j = i; j < moves.length; j++) {
            const b = moves[j].from;

            if (b > a) {
                moves[j].from--;
            }
        }
    }

    // Interleave the moves so they can be applied one by one rather than all at once
    for (let i = 0; i < moves.length; i++) {
        const a = moves[i];
        for (let j = moves.length - 1; j > i; j--) {
            const b = moves[j];

            if (b.from < a.to) {
                a.to++;
            } else {
                b.from++;
            }
        }
    }

    const copy = tabs.slice();
    for (const move of moves) {
        const [item] = copy.splice(move.from, 1);
        copy.splice(move.to, 0, item);
    }

    return copy;
}

export const tabsAtom = atom<Tab[]>([]);
export const selectedTabAtom = atom<Tab['id'] | undefined>(undefined);

export const useTabs = () => {
    const [_tabs, setTabs] = useAtom(tabsAtom);
    const [selectedTab, setSelectedTab] = useAtom(selectedTabAtom);
    const getDocumentModel = useGetDocumentModel();
    const getEditor = useGetEditor();
    const documentModels = useDocumentModels();
    const editors = useDocumentModels();

    const tabs: Pick<
        ListData<Tab>,
        'items' | 'getItem' | 'append' | 'moveBefore' | 'moveAfter' | 'remove'
    > & {
        selectedTab: typeof selectedTab;
        setSelectedTab: typeof setSelectedTab;
        addTab: (tab?: Tab) => void;
        updateTab: (tab: Tab) => void;
        closeTab: (tab: Tab) => void;
        fromDocument: (document: Document, id?: string) => Promise<Tab>;
        fromString: (text: string) => Promise<Tab>;
    } = useMemo(
        () => ({
            items: _tabs,
            getItem(key) {
                const tab = _tabs.find(tab => tab.id === key);
                if (!tab) {
                    throw new Error(`Tab with id ${key} not found`);
                }
                return tab;
            },
            append(...values) {
                setTabs(tabs => [...tabs.slice(), ...values]);
            },
            moveBefore(key, keys) {
                setTabs(tabs => {
                    const toIndex = tabs.findIndex(t => t.id === key);
                    if (toIndex === -1) {
                        return tabs;
                    }

                    const keyArray = Array.isArray(keys) ? keys : [...keys];
                    const indices = keyArray
                        .map(key => tabs.findIndex(item => item.id === key))
                        .sort();
                    return moveTab(tabs, indices, toIndex);
                });
            },
            moveAfter(key, keys) {
                setTabs(tabs => {
                    const toIndex = tabs.findIndex(item => item.id === key);
                    if (toIndex === -1) {
                        return tabs;
                    }

                    const keyArray = Array.isArray(keys) ? keys : [...keys];
                    const indices = keyArray
                        .map(key => tabs.findIndex(item => item.id === key))
                        .sort();
                    return moveTab(tabs, indices, toIndex + 1);
                });
            },
            remove(...keys) {
                setTabs(tabs => tabs.filter(tab => !keys.includes(tab.id)));
            },
            selectedTab,
            setSelectedTab,
            addTab(tab?: Tab) {
                const newTab = tab ?? createTab('new');
                tabs.append(newTab);
                tabs.setSelectedTab(newTab.id);
            },
            updateTab(tab: Tab) {
                setTabs(_tabs => {
                    const index = _tabs.findIndex(_tab => _tab.id === tab.id);
                    const newTabs = _tabs.slice();
                    newTabs[index > -1 ? index : newTabs.length] = tab;
                    return newTabs;
                });
            },
            closeTab(tab: Tab) {
                tabs.remove(tab.id);
            },
            fromDocument(document, id) {
                return Tab.fromDocument(
                    document,
                    getDocumentModel,
                    getEditor,
                    id
                );
            },
            fromString(text) {
                return Tab.fromString(text, getDocumentModel, getEditor);
            },
        }),
        [_tabs, selectedTab, documentModels, editors]
    );

    return tabs;
};
