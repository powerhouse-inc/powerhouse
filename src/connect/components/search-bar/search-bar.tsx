import { DropdownMenu } from '@/powerhouse/components/dropdown-menu';
import { TextInput, TextInputProps } from '@/powerhouse/components/text-input';
import { mergeClassNameProps } from '@/powerhouse/utils';
import React, { useMemo } from 'react';

import { Icon } from '@/powerhouse';
import { FilterItem, FilterItemType } from './filter-item';

export interface ConnectSearchBarProps extends TextInputProps {
    placeholder?: string;
    filterLabel?: string;
    filterItems?: Array<FilterItemType>;
    selectedFilter?: string;
    onFilterSelect?: (filterId: string) => void;
}

export const ConnectSearchBar: React.FC<ConnectSearchBarProps> = props => {
    const {
        value,
        onChange,
        placeholder,
        filterLabel,
        filterItems,
        selectedFilter,
        onFilterSelect = () => {},
        ...containerProps
    } = props;

    const items = useMemo(
        () =>
            filterItems?.map(item => ({
                id: item.id,
                content: <FilterItem item={item} />,
            })),
        [filterItems],
    );

    const selectedItemFilter = filterItems?.find(
        item => item.id === selectedFilter,
    );

    const filterLabelContent = selectedItemFilter ? (
        <FilterItem item={selectedItemFilter} className="gap-x-1" />
    ) : (
        filterLabel && (
            <div className="mr-2 text-sm text-[#6F767E] font-semibold">
                {filterLabel}
            </div>
        )
    );

    const startAdornment = <Icon name="search" className="mr-3" />;

    const endAdornment = (
        <DropdownMenu
            items={items || []}
            onItemClick={onFilterSelect}
            popoverProps={{ placement: 'bottom right', offset: 4 }}
            className="ml-3 flex flex-row outline-none h-full items-center"
            menuClassName="bg-[#FCFCFC] border border-[#F4F4F4] rounded-xl p-2"
            menuItemClassName="hover:bg-[#F4F4F4] rounded-lg overflow-hidden cursor-pointer h-10"
        >
            {filterLabelContent}
            <Icon name="chevron-down" />
        </DropdownMenu>
    );

    return (
        <TextInput
            value={value}
            onChange={onChange}
            startAdornment={startAdornment}
            endAdornment={endAdornment}
            inputProps={{ placeholder, className: 'text-sm' }}
            {...mergeClassNameProps(
                containerProps,
                'text-[#6F767E] bg-[#FCFCFC] px-4 h-[52px] items-center rounded-xl border border-[#EFEFEF]',
            )}
        />
    );
};
