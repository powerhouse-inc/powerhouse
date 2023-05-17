import {
    DroppableCollectionReorderEvent,
    Tab as TabComponent,
    TabList,
    TabPanel,
    TabPanels,
    Tabs,
} from 'react-aria-components';
import { Item, useListData } from 'react-stately';
import { ReorderableTabList } from './list';

export interface ITab {
    name: string;
    content: React.ReactElement;
}

export class Tab implements ITab {
    constructor(public name: string, public content: React.ReactElement) {}
}

interface IProps {
    tabs: ITab[];
    onCreate: () => void;
    selectedTab?: React.Key | null | undefined;
    onTabSelected?: ((key: React.Key) => unknown) | undefined;
}

export default function ({
    tabs,
    onCreate,
    selectedTab,
    onTabSelected,
}: IProps) {
    const list = useListData({
        initialItems: tabs.map((tab, i) => ({
            id: window.crypto.randomUUID(),
            ...tab,
        })),
    });

    const onReorder = (e: DroppableCollectionReorderEvent) => {
        if (e.target.dropPosition === 'before') {
            list.moveBefore(e.target.key, e.keys);
        } else if (e.target.dropPosition === 'after') {
            list.moveAfter(e.target.key, e.keys);
        }
    };

    return (
        <ReorderableTabList
            aria-label="Favorite animals"
            selectionMode="multiple"
            selectionBehavior="replace"
            items={list.items}
            selectedKey={selectedTab}
            onSelectionChange={onTabSelected}
            onReorder={onReorder}
            onRootDrop={console.log}
        >
            {
                // @ts-ignore
                item => <Item>{item.name}</Item>
            }
        </ReorderableTabList>
    );
    return (
        <Tabs>
            <div className="mb-4 flex">
                <TabList
                    className="flex"
                    aria-label="Open documents"
                    selectedKey={selectedTab}
                    onSelectionChange={onTabSelected}
                >
                    {tabs.map((tab, i) => (
                        <TabComponent
                            id={tab.name + i}
                            className="min-w-36 mr-4 cursor-pointer overflow-hidden text-ellipsis whitespace-nowrap rounded-3xl bg-light px-6 py-4 aria-selected:font-bold"
                            aria-label={tab.name}
                        >
                            {tab.name}
                        </TabComponent>
                    ))}
                </TabList>
                <button onClick={onCreate}>New tab</button>
            </div>
            <hr className="mb-6" />
            <TabPanels>
                {tabs.map(({ name, content }, i) => (
                    <TabPanel id={name + i}>{content}</TabPanel>
                ))}
            </TabPanels>
        </Tabs>
    );
}
