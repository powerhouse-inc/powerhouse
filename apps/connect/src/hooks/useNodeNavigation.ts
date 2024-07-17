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

export const useNodeNavigation = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const params = useParams<RouteParams>();
    const { driveNodes, selectedNode, selectedNodePath, setSelectedNode } =
        useUiNodesContext();

    useEffect(() => {
        const pathname = buildPathname();
        navigate({ pathname, search: location.search });

        function buildPathname() {
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
            const pathname = [driveNodeComponent, ...nodePathComponents].join(
                '/',
            );
            return pathname;
        }

        function makeDriveNodeUrlComponent(driveNode: UiDriveNode) {
            const component = driveNode.slug || driveNode.name || driveNode.id;

            return `/d/${encodeURIComponent(component)}`;
        }
    }, [selectedNodePath, location.search, navigate]);

    useEffect(() => {
        if (selectedNode) return;

        if (!params.driveId) {
            setSelectedNode(driveNodes[0]);
            return;
        }

        const driveId = decodeURIComponent(params.driveId);
        const driveNode = driveNodes.find(
            node =>
                node.id === driveId ||
                node.slug === driveId ||
                node.name === driveId,
        );

        const nodeNames = (params['*'] ?? '')
            .split('/')
            .filter(Boolean)
            .map(decodeURIComponent);

        if (!driveNode) {
            return;
        }

        let currentNode: UiNode = driveNode;

        for (const nodeName of nodeNames) {
            if (currentNode.kind === FILE) break;

            const nextNode: UiNode | undefined = currentNode.children.find(
                node => node.name === nodeName,
            );

            if (!nextNode) {
                console.error('Node not found:', nodeName);
                break;
            }

            currentNode = nextNode;
        }

        setSelectedNode(currentNode);
    }, [driveNodes, params, selectedNode, setSelectedNode]);
};
