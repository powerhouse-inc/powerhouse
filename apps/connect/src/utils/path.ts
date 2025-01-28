import { Node } from 'document-model-libs/document-drive';

export const sanitizePath = (path: string) =>
    path.replace(/\s/g, '-').toLowerCase();

export const getLastIndexFromPath = (
    nodes: Array<Node>,
    name: string,
    parentFolder?: string
): number | null => {
    const regexp = new RegExp(`^${name}(\\s\\d+)?$`, 'i');

    const filteredNodes = nodes
        .filter(
            node => node.parentFolder == parentFolder && regexp.test(node.name)
        )
        .map(node => {
            const index = node.name.match(/(\d+)?$/i);
            if (index) return Number(index[0]);
            return 0;
        })
        .sort((a, b) => a - b);

    if (!filteredNodes || filteredNodes.length === 0) return null;
    return filteredNodes[filteredNodes.length - 1];
};
