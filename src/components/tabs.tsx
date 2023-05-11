import {
    Tab as TabComponent,
    TabList,
    TabPanel,
    TabPanels,
    Tabs,
} from 'react-aria-components';

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
