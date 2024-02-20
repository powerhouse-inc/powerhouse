import {
    DropdownMenu,
    Icon,
    TextInput,
    TextInputProps,
    mergeClassNameProps,
} from '@/powerhouse';
import { useMemo } from 'react';
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
            <div className="mr-2 text-sm font-semibold text-slate-200">
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
            className="ml-3 flex h-full flex-row items-center outline-none"
            menuClassName="bg-gray-50 border border-gray-100 rounded-xl p-2"
            menuItemClassName="hover:bg-gray-100 rounded-lg overflow-hidden cursor-pointer h-10"
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
                'h-[52px] items-center rounded-xl border border-gray-200 bg-gray-50 px-4 text-slate-200',
            )}
        />
    );
};
