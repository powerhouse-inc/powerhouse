import { Node } from 'document-model-libs/document-drive';

export const sanitizePath = (path: string) =>
    path.replace(/\s/g, '-').toLowerCase();

export const getLastIndexFromPath = (
    nodes: Array<Node>,
    path: string
): number | null => {
    const regexp = new RegExp(`^${path}(-\\d+)?$`, 'i');

    const filteredNodes = nodes
        ?.filter(node => regexp.test(node.path))
        .map(node => node.path)
        .map(path => {
            const index = path.match(/(\d+)?$/i);
            if (index) return Number(index[0]);
            return 0;
        })
        .sort((a, b) => a - b);

    if (!filteredNodes || filteredNodes.length === 0) return null;
    return filteredNodes[filteredNodes.length - 1];
};
