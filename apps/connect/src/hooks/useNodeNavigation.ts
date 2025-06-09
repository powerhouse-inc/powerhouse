import { makeNodeSlugFromNodeName } from '#utils';
import {
    useNodeById,
    useNodeBySlug,
    useSelectedDriveId,
    useSelectedNodeId,
    useSelectedNodePath,
    useSetSelectedNodeId,
} from '@powerhousedao/common';
import { type DocumentDriveDocument, type Node } from 'document-drive';
import { useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useDocumentDriveById } from './useDocumentDriveById';
type RouteParams = {
    driveId?: string;
    '*'?: string;
};

function buildPathname(
    selectedDrive: DocumentDriveDocument | null | undefined,
    selectedNodePath: Node[],
) {
    if (!selectedDrive) return '';
    const driveNodeComponent = makeDriveNodeUrlComponent(selectedDrive);
    const nodePathComponents = selectedNodePath
        .slice(1)
        .map(node => encodeURIComponent(makeNodeSlugFromNodeName(node.name)));
    const pathname = [driveNodeComponent, ...nodePathComponents].join('/');
    return pathname;
}

function makeDriveNodeUrlComponent(drive: DocumentDriveDocument) {
    const component = drive.slug || drive.id;

    return `/d/${encodeURIComponent(component)}`;
}

function useSelectedNodeIdFromPathname(nodePathFromPathname: string[]) {
    const lastPartOfPath = nodePathFromPathname.at(-1) ?? null;
    const maybeNodeFromId = useNodeById(lastPartOfPath);
    const maybeNodeFromSlug = useNodeBySlug(lastPartOfPath);
    return maybeNodeFromId?.id ?? maybeNodeFromSlug?.id ?? null;
}

export const useNodeNavigation = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const selectedNodePath = useSelectedNodePath();
    const selectedNodeId = useSelectedNodeId();
    const selectedDriveId = useSelectedDriveId();
    const { drive: selectedDrive } = useDocumentDriveById(selectedDriveId);
    const setSelectedNodeId = useSetSelectedNodeId();
    const { search, pathname } = location;
    const params = useParams<RouteParams>();
    const nodePathFromPathname =
        params['*']?.split('/').filter(Boolean).map(decodeURIComponent) ?? [];

    const selectedNodeIdFromPathname =
        useSelectedNodeIdFromPathname(nodePathFromPathname);
    const selectedNodePathname = buildPathname(selectedDrive, selectedNodePath);

    // when selectedNodePathname changes, navigate to the new path
    useEffect(() => {
        if (!selectedNodePathname || selectedNodePathname === pathname) return;

        navigate({ pathname: selectedNodePathname, search });
    }, [search, navigate, selectedNodePathname]);

    // on first load, set the selected node from the pathname
    // defaults to setting the first drive node if no drive node is found
    useEffect(() => {
        if (selectedNodeId || !selectedNodeIdFromPathname) return;

        setSelectedNodeId(selectedNodeIdFromPathname);
    }, [selectedNodeId, selectedNodeIdFromPathname, setSelectedNodeId]);

    // respond to changes in the url (browser back and forward buttons)
    // update the selected node accordingly
    useEffect(() => {
        if (
            !selectedNodeIdFromPathname ||
            selectedNodeIdFromPathname === selectedNodeId
        )
            return;

        setSelectedNodeId(selectedNodeIdFromPathname);
    }, [selectedNodeIdFromPathname, setSelectedNodeId]);
};
