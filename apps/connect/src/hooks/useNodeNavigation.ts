import { DRIVE, FILE, UiDriveNode, UiNode } from '@powerhousedao/design-system';
import { useUiNodesContext } from '@powerhousedao/reactor-browser/hooks/useUiNodesContext';
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
        .map(node => encodeURIComponent(node.slug || node.name));
    const pathname = [driveNodeComponent, ...nodePathComponents].join('/');
    return pathname;
}

function makeDriveNodeUrlComponent(driveNode: UiDriveNode) {
    const component = driveNode.slug || driveNode.name || driveNode.id;

    return `/d/${encodeURIComponent(component)}`;
}

function getSelectedNodeFromPathname(
    driveNodes: (UiDriveNode | null)[],
    driveIdFromPathname: string | undefined,
    nodeNamesFromPathname: string | undefined,
) {
    if (!driveIdFromPathname) {
        return null;
    }

    const driveId = decodeURIComponent(driveIdFromPathname);
    const driveNode = driveNodes.find(
        node =>
            node?.id === driveId ||
            node?.slug === driveId ||
            node?.name === driveId,
    );

    if (!driveNode) return null;
    if (!nodeNamesFromPathname) return driveNode;

    const nodeNames = nodeNamesFromPathname
        .split('/')
        .filter(Boolean)
        .map(decodeURIComponent);

    let selectedNode: UiNode = driveNode;

    for (const nodeName of nodeNames) {
        if (selectedNode.kind === FILE) break;

        const nextNode: UiNode | undefined = selectedNode.children.find(
            node => node.slug === nodeName || node.name === nodeName,
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
    const { search, pathname } = location;
    const params = useParams<RouteParams>();
    const { driveNodes, selectedNode, selectedNodePath, setSelectedNode } =
        useUiNodesContext();
    const driveIdFromPathname = params.driveId;
    const nodeNamesFromPathname = params['*'];
    const selectedNodeFromPathname = getSelectedNodeFromPathname(
        driveNodes,
        driveIdFromPathname,
        nodeNamesFromPathname,
    );
    const selectedNodePathname = buildPathname(selectedNodePath);

    // when selectedNodePathname changes, navigate to the new path
    useEffect(() => {
        if (!selectedNodePathname || selectedNodePathname === pathname) return;

        navigate({ pathname: selectedNodePathname, search });
    }, [search, navigate, selectedNodePathname]);

    // on first load, set the selected node from the pathname
    // defaults to setting the first drive node if no drive node is found
    useEffect(() => {
        if (selectedNode || !selectedNodeFromPathname) return;

        setSelectedNode(selectedNodeFromPathname);
    }, [selectedNode, selectedNodeFromPathname, setSelectedNode]);

    // respond to changes in the url (browser back and forward buttons)
    // update the selected node accordingly
    useEffect(() => {
        const selectedNodeFromPathname = getSelectedNodeFromPathname(
            driveNodes,
            driveIdFromPathname,
            nodeNamesFromPathname,
        );

        if (!selectedNodeFromPathname) return;

        setSelectedNode(selectedNodeFromPathname);
    }, [
        driveNodes,
        driveIdFromPathname,
        nodeNamesFromPathname,
        setSelectedNode,
    ]);
};
