import { TreeItem } from '@powerhousedao/design-system';

export const sortTreeItemsByLabel = (a: TreeItem, b: TreeItem) =>
    a.label.localeCompare(b.label);
