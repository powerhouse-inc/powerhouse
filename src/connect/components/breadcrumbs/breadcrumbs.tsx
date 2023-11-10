import { TreeItem } from '..';

export type BreadcrumbsProps<TItemId extends string> =
    React.HTMLAttributes<HTMLDivElement> & {
        items: TreeItem<TItemId>;
        onItemClick?: (
            event: React.MouseEvent<HTMLDivElement, MouseEvent>,
            item: TreeItem<TItemId>,
        ) => void;
    };

export function Breadcrumbs<TItemId extends string>(
    props: BreadcrumbsProps<TItemId>,
) {
    return <div></div>;
}

export type BreadcrumbProps = {
    onClick?: (
        event: React.MouseEvent<HTMLDivElement, MouseEvent>,
        item: TreeItem<string>,
    ) => void;
    item: TreeItem<string>;
};

export function Breadcrumb(props: BreadcrumbProps) {
    return <div></div>;
}
