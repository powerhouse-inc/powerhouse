import { useGetItemByPath } from '@/connect';
import { DivProps, Icon } from '@/powerhouse';
import { useState } from 'react';
import { AddNewItemInput } from './add-new-item-input';

export type BreadcrumbsProps = DivProps & {
    filterPath: string;
    onItemClick?: (
        event: React.MouseEvent<HTMLDivElement>,
        filterPath: string,
    ) => void;
    onAddNewItem: (basePath: string, option: 'new-folder') => void;
    onSubmitInput: (basepath: string, label: string) => void;
    onCancelInput: (basePath: string) => void;
};

/**
 * The `Breadcrumbs` component displays the current path (provided by the filterPath prop).
 * It also allows the user to add a new folder to the current path.
 */
export function Breadcrumbs(props: BreadcrumbsProps) {
    const [isAddingNewItem, setIsAddingNewItem] = useState(false);

    function onAddNew() {
        setIsAddingNewItem(true);
        props.onAddNewItem(props.filterPath, 'new-folder');
    }

    const filterSegments = props.filterPath
        .split('/')
        .map((_, index, arr) => arr.slice(0, index + 1).join('/'));

    return (
        <div className="flex h-9 flex-row items-center gap-2 p-6 text-grey-500">
            {filterSegments.map(routeSegment => (
                <Breadcrumb
                    key={routeSegment}
                    filterPath={routeSegment}
                    onClick={e => props.onItemClick?.(e, routeSegment)}
                    className="transition-colors last-of-type:text-grey-800 hover:text-grey-800"
                />
            ))}
            {isAddingNewItem ? (
                <AddNewItemInput
                    defaultValue="New Folder"
                    placeholder="New Folder"
                    onSubmit={value => {
                        props.onSubmitInput(props.filterPath, value);
                        setIsAddingNewItem(false);
                    }}
                    onCancel={() => {
                        props.onCancelInput(props.filterPath);
                        setIsAddingNewItem(false);
                    }}
                />
            ) : (
                <button
                    onClick={onAddNew}
                    className="ml-1 flex flex-row items-center justify-center gap-2 rounded-[6px] bg-grey-50 px-2 py-[6px] transition-colors hover:bg-grey-200 hover:text-grey-800"
                >
                    <Icon name="plus" size={14} />
                    Add new
                </button>
            )}
        </div>
    );
}

export type BreadcrumbProps = {
    onClick?: (
        event: React.MouseEvent<HTMLDivElement>,
        filterPath: string,
    ) => void;
    filterPath: string;
    className?: string;
};

export function Breadcrumb(props: BreadcrumbProps) {
    const label = props.filterPath.split('/').pop();

    const getItemByPath = useGetItemByPath();
    const item = getItemByPath(props.filterPath);

    return (
        <>
            <div
                role="button"
                className={props.className}
                onClick={e => props.onClick?.(e, props.filterPath)}
            >
                {item?.label || label}
            </div>
            /
        </>
    );
}
