import {
    DRIVE,
    FILE,
    UiDriveNode,
    UiNode,
    useUiNodesContext,
} from '@powerhousedao/design-system';
import { useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

type RouteParams = {
    driveId?: string;
    '*'?: string;
};

function buildPathname(selectedNodePath: UiNode[]) {
    const driveNode = selectedNodePath[0];
    if (!driveNode) {
        return;
    }
    if (driveNode.kind !== DRIVE) {
        throw new Error(
            'Node path is invalid, first node is not a drive node.',
        );
    }
    const driveNodeComponent = makeDriveNodeUrlComponent(driveNode);
    const nodePathComponents = selectedNodePath
        .slice(1)
        .map(node => encodeURIComponent(node.name));
    const pathname = [driveNodeComponent, ...nodePathComponents].join('/');
    return pathname;
}

function makeDriveNodeUrlComponent(driveNode: UiDriveNode) {
    const component = driveNode.slug || driveNode.name || driveNode.id;

    return `/d/${encodeURIComponent(component)}`;
}

function getSelectedNodeFromPathname(
    driveNodes: UiDriveNode[],
    driveIdFromPathname: string | undefined,
    nodeNamesFromPathname: string | undefined,
) {
    if (!driveIdFromPathname || !nodeNamesFromPathname) {
        return driveNodes[0];
    }

    const driveId = decodeURIComponent(driveIdFromPathname);
    const driveNode = driveNodes.find(
        node =>
            node.id === driveId ||
            node.slug === driveId ||
            node.name === driveId,
    );

    const nodeNames = nodeNamesFromPathname
        .split('/')
        .filter(Boolean)
        .map(decodeURIComponent);

    if (!driveNode) return driveNodes[0];

    let selectedNode: UiNode = driveNode;

    for (const nodeName of nodeNames) {
        if (selectedNode.kind === FILE) break;

        const nextNode: UiNode | undefined = selectedNode.children.find(
            node => node.name === nodeName,
        );

        if (!nextNode) {
            console.error('Node not found:', nodeName);
            break;
        }

        selectedNode = nextNode;
    }

    return selectedNode;
}

export const useNodeNavigation = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const params = useParams<RouteParams>();
    const { driveNodes, selectedNode, selectedNodePath, setSelectedNode } =
        useUiNodesContext();

    useEffect(() => {
        const pathname = buildPathname(selectedNodePath);
        navigate({ pathname, search: location.search });
    }, [selectedNodePath, location.search, navigate]);

    useEffect(() => {
        if (selectedNode) return;

        const driveIdFromPathname = params.driveId;
        const nodeNamesFromPathname = params['*'];

        const selectedNodeFromPathname = getSelectedNodeFromPathname(
            driveNodes,
            driveIdFromPathname,
            nodeNamesFromPathname,
        );

        setSelectedNode(selectedNodeFromPathname);
    }, [driveNodes, params, selectedNode, setSelectedNode]);
};
