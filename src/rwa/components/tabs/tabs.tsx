import { DivProps, Icon, mergeClassNameProps } from '@/powerhouse';
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

const defaultLabels: RWATabsProps['labels'] = {
    export: 'Export',
};

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
    onUndo: () => void;
    onRedo: () => void;
    onExport: () => void;
    onClose: () => void;
    onSwitchboardLinkClick?: () => void;
    canUndo: boolean;
    canRedo: boolean;
    labels?: {
        export: string;
    };
}

export const RWATabs: React.FC<RWATabsProps> = props => {
    const {
        tabs,
        children,
        labels = defaultLabels,
        tabListContainerProps = {},
        tabListProps = {},
        tabProps = {},
        onRedo,
        onUndo,
        canRedo,
        canUndo,
        onExport,
        onClose,
        onSwitchboardLinkClick,
        ...tabsProps
    } = props;

    const { className: tabPropsClassName, ...restTabProps } = tabProps;

    // const buttonClass =
    //     'w-8 h-8 tab-shadow rounded-lg flex justify-center items-center';

    return (
        <Tabs {...tabsProps}>
            <div
                {...mergeClassNameProps(
                    tabListContainerProps,
                    'flex items-center justify-between',
                )}
            >
                <div className="flex w-48 gap-x-2">
                    {/* <button
                        className={buttonClass}
                        onClick={onUndo}
                        disabled={!canUndo}
                    >
                        <Icon
                            name="redo-arrow"
                            size={24}
                            className={twMerge(
                                'scale-x-[-1]',
                                canUndo ? 'active:opacity-50' : 'text-gray-500',
                            )}
                        />
                    </button>
                    <button
                        className={buttonClass}
                        onClick={onRedo}
                        disabled={!canRedo}
                    >
                        <Icon
                            name="redo-arrow"
                            size={24}
                            className={twMerge(
                                canRedo ? 'active:opacity-50' : 'text-gray-500',
                            )}
                        />
                    </button> */}
                </div>
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
                <div className="flex w-48 justify-end gap-x-2">
                    {onSwitchboardLinkClick && (
                        <button
                            className="flex h-8 items-center gap-x-2 rounded border border-gray-200 px-3 text-sm font-semibold text-gray-900 active:opacity-50"
                            onClick={onSwitchboardLinkClick}
                        >
                            <Icon name="drive" size={16} />
                        </button>
                    )}
                    <button
                        className="flex h-8 items-center gap-x-2 rounded border border-gray-200 px-3 text-sm font-semibold text-gray-900 active:opacity-50"
                        onClick={onExport}
                    >
                        {labels.export} <Icon name="save" size={16} />
                    </button>
                    <button
                        className="flex size-8 items-center justify-center rounded border border-gray-200 active:opacity-50"
                        onClick={onClose}
                    >
                        <Icon name="xmark" />
                    </button>
                </div>
            </div>
            {children}
        </Tabs>
    );
};
