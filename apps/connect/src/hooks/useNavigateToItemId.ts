import { UiNode } from '@powerhousedao/design-system';
import { useLocation, useNavigate } from 'react-router-dom';

type RouteParams = {
    driveId?: string;
    '*'?: string;
};

export const useHandleUrl = () => {
    const navigate = useNavigate();
    const location = useLocation();

    const params = useParams<RouteParams>();
    const [paramsShown, setParamsShown] = useState<RouteParams | undefined>(
        undefined,
    );

    useEffect(() => {
        setParamsShown(undefined);
    }, [params]);

    useEffect(() => {
        if (
            (paramsShown?.driveId === params.driveId &&
                paramsShown?.['*'] === params['*']) ||
            !params.driveId
        ) {
            return;
        }

        try {
            // retrieves the drive id from the url
            const driveId = decodeURIComponent(params.driveId);
            const drive = documentDrives.find(
                drive =>
                    drive.state.global.slug === driveId ||
                    drive.state.global.id === driveId ||
                    drive.state.global.name === driveId,
            );
            if (!drive) {
                return;
            }

            // builds the path from the url checking if the nodes exist
            const path = [encodeID(drive.state.global.id)];
            let currentNodes = drive.state.global.nodes.filter(
                node => !node.parentFolder,
            );
            if (params['*']) {
                const nodeNames = decodeURIComponent(params['*']).split('/');

                for (const nodeName of nodeNames) {
                    const node = currentNodes.find(
                        node => node.name === nodeName,
                    );

                    if (!node) {
                        console.error('Node not found:', nodeName);
                        break;
                    }

                    // if the node is a file, then opens it instead of adding it to the path
                    if (isFileNode(node)) {
                        if (
                            selectedFileNode?.drive !== drive.state.global.id ||
                            selectedFileNode.id !== node.id
                        ) {
                            setSelectedFileNode({
                                drive: drive.state.global.id,
                                id: node.id,
                                parentFolder: node.parentFolder,
                            });
                        }
                    }
                    path.push(encodeID(node.id));

                    const nextNodes = drive.state.global.nodes.filter(
                        n => n.parentFolder === node.id,
                    );

                    if (!nextNodes.length) break;

                    currentNodes = nextNodes;
                }
            }
            setSelectedPath(path.join('/'));
            setParamsShown(params);
        } catch (e) {
            console.error(e);
        }
    }, [params, paramsShown, documentDrives]);

    return (uiNode: UiNode) => {
        const itemPath = uiNode.id;
        const fullPath = `/d/${encodeURI(itemPath)}`;
        navigate({ pathname: fullPath, search: location.search });
    };
};
