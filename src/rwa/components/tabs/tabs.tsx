import { DivProps, mergeClassNameProps } from '@/powerhouse';
import React from 'react';
import {
    Key,
    Tab,
    TabList,
    TabListProps,
    TabProps,
    TabRenderProps,
    Tabs,
    TabsProps,
} from 'react-aria-components';
import { twMerge } from 'tailwind-merge';

const getTabStyles = (tabProps: TabRenderProps) => {
    const { isSelected, isDisabled } = tabProps;

    return twMerge(
        'flex h-[30px] w-[130px] items-center justify-center text-sm font-semibold text-gray-600 outline-none transition duration-300 ease-in-out',
        isSelected && 'tab-shadow rounded-lg bg-gray-50 text-gray-900',
        isDisabled && 'cursor-not-allowed text-gray-400',
    );
};

export type RWATabItem = {
    id: Key;
    label: React.ReactNode;
    props?: TabProps;
};

export interface RWATabsProps extends TabsProps {
    tabs: RWATabItem[];
    children?: React.ReactNode;
    tabListContainerProps?: DivProps;
    tabListProps?: TabListProps<RWATabItem>;
    tabProps?: TabProps;
}

export const RWATabs: React.FC<RWATabsProps> = props => {
    const {
        tabs,
        children,
        tabListContainerProps = {},
        tabListProps = {},
        tabProps = {},
        ...tabsProps
    } = props;

    const { className: tabPropsClassName, ...restTabProps } = tabProps;

    return (
        <Tabs {...tabsProps}>
            <div
                {...mergeClassNameProps(tabListContainerProps, 'flex flex-col')}
            >
                <TabList
                    {...mergeClassNameProps(
                        tabListProps,
                        'flex cursor-pointer self-center rounded-xl bg-slate-50 p-1',
                    )}
                >
                    {tabs.map(({ id, label, props: _tabProps = {} }) => (
                        <Tab
                            key={id}
                            id={id}
                            className={tabRenderProps =>
                                twMerge(
                                    getTabStyles(tabRenderProps),
                                    typeof tabPropsClassName === 'string' &&
                                        tabPropsClassName,
                                    typeof tabPropsClassName === 'function' &&
                                        tabPropsClassName(tabRenderProps),
                                )
                            }
                            {...restTabProps}
                            {..._tabProps}
                        >
                            {label}
                        </Tab>
                    ))}
                </TabList>
            </div>
            {children}
        </Tabs>
    );
};
