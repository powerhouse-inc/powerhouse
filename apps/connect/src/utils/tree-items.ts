import { type UiNode } from '@powerhousedao/design-system';

export const sortUiNodesByName = (a: UiNode, b: UiNode) =>
    a.name.localeCompare(b.name);
