import {
    Breadcrumbs,
    TreeItem,
    decodeID,
    encodeID,
    getRootPath,
    useGetItemById,
    useGetItemByPath,
    useItemActions,
    useItemsContext,
} from '@powerhousedao/design-system';
import { isFileNode } from 'document-model-libs/document-drive';
import { Document, DocumentModel, Operation } from 'document-model/document';
import path from 'path';
import { Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import Button from 'src/components/button';
import { DocumentEditor } from 'src/components/editors';
import FolderView from 'src/components/folder-view';
import { useModal } from 'src/components/modal';
import { SearchBar } from 'src/components/search-bar';
import { useConnectConfig } from 'src/hooks/useConnectConfig';
import { useDocumentDriveById } from 'src/hooks/useDocumentDriveById';
import { useDocumentDriveServer } from 'src/hooks/useDocumentDriveServer';
import { useDrivesContainer } from 'src/hooks/useDrivesContainer';
import { useGetDocumentById } from 'src/hooks/useGetDocumentById';
import { useNavigateToItemId } from 'src/hooks/useNavigateToItemId';
import { useOpenSwitchboardLink } from 'src/hooks/useOpenSwitchboardLink';
import { useUserPermissions } from 'src/hooks/useUserPermissions';
import { useFileNodeDocument, useSelectedPath } from 'src/store/document-drive';
import {
    useFilteredDocumentModels,
    useGetDocumentModel,
} from 'src/store/document-model';
import { usePreloadEditor } from 'src/store/editor';
import { exportFile } from 'src/utils';
import { validateDocument } from 'src/utils/validate-document';
import { v4 as uuid } from 'uuid';

const getDocumentModelName = (name: string) => {
    if (name === 'RealWorldAssets') {
        return 'RWA Portfolio';
    }

    return name;
};

type RouteParams = {
    driveId?: string;
    '*'?: string;
};

const Content = () => {
    const { items } = useItemsContext();
    const [selectedPath, setSelectedPath] = useSelectedPath();
    const getItemByPath = useGetItemByPath();
    const getItemById = useGetItemById();
    const actions = useItemActions();
    const [connectConfig] = useConnectConfig();
    const { t } = useTranslation();

    const selectedFolder = getItemByPath(selectedPath || '');
    const driveID = getRootPath(selectedFolder?.path ?? '');
    const decodedDriveID = decodeID(driveID);
    const { showModal } = useModal();
    const getDocumentById = useGetDocumentById();
    const { isRemoteDrive } = useDocumentDriveById(decodedDriveID);
    const openSwitchboardLink = useOpenSwitchboardLink(decodedDriveID);

    const { addFile, deleteNode, documentDrives, renameNode } =
        useDocumentDriveServer();
    const documentModels = useFilteredDocumentModels();
    const getDocumentModel = useGetDocumentModel();
    const { onSubmitInput } = useDrivesContainer();
    const navigateToItemId = useNavigateToItemId();
    const { isAllowedToCreateDocuments } = useUserPermissions();

    const driveNodes = documentDrives.find(
        drive => drive.state.global.id === decodedDriveID,
    )?.state.global.nodes;

    const [selectedFileNode, setSelectedFileNode] = useState<
        { drive: string; id: string; parentFolder: string | null } | undefined
    >(undefined);
    const [selectedDocument, setSelectedDocument, addOperation] =
        useFileNodeDocument(decodedDriveID, selectedFileNode?.id);

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
                node => node.parentFolder === null,
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

    const preloadEditor = usePreloadEditor();

    // preload document editors
    useEffect(() => {
        // waits 1 second to preload editors
        const id = requestIdleCallback(async () => {
            for (const documentModel of documentModels) {
                await preloadEditor(documentModel.documentModel.id);
            }
        });
        return () => cancelIdleCallback(id);
    }, [documentModels, preloadEditor]);

    useEffect(() => {
        return window.electronAPI?.handleFileOpen(async file => {
            if (!selectedPath) {
                return;
            }
            const fileNode = await addFile(
                file.content,
                decodedDriveID,
                file.name,
                selectedFolder && selectedFolder.type === 'FOLDER'
                    ? decodeID(selectedFolder.id)
                    : undefined,
            );
            if (!driveNodes) {
                throw new Error(`Drive with id ${decodedDriveID} not found`);
            }

            if (fileNode) {
                setSelectedFileNode({
                    drive: decodedDriveID,
                    id: fileNode.id,
                    parentFolder: fileNode.parentFolder,
                });
                navigateToItemId(fileNode.id);
            }
        });
    }, [selectedPath]);

    async function handleAddOperation(operation: Operation) {
        if (!selectedDocument) {
            throw new Error('No document selected');
        }
        if (!addOperation) {
            throw new Error('No add operation function defined');
        }
        await addOperation(operation);
    }

    function createDocument(documentModel: DocumentModel) {
        showModal('createDocument', {
            documentModel,
            selectedFolder,
            driveID: decodedDriveID,
            driveNodes,
            setSelectedFileNode,
        });
    }

    function exportDocument(document: Document) {
        const validationErrors = validateDocument(document);

        if (validationErrors.length) {
            showModal('confirmationModal', {
                title: t('modals.exportDocumentWithErrors.title'),
                body: (
                    <div>
                        <p>{t('modals.exportDocumentWithErrors.body')}</p>
                        <ul className="mt-4 flex list-disc flex-col items-start px-4 text-xs">
                            {validationErrors.map((error, index) => (
                                <li key={index}>{error.message}</li>
                            ))}
                        </ul>
                    </div>
                ),
                cancelLabel: t('common.cancel'),
                continueLabel: t('common.export'),
                onCancel(closeModal) {
                    closeModal();
                },
                onContinue(closeModal) {
                    closeModal();
                    return exportFile(document, getDocumentModel);
                },
            });
        } else {
            return exportFile(document, getDocumentModel);
        }
    }

    const selectFolder = (item: TreeItem) => {
        actions.setExpandedItem(item.id, true);
        actions.setSelectedItem(item.id);
        navigateToItemId(item.id);
    };

    const onFolderSelectedHandler = (itemId: string) => {
        const item = items.find(item => item.id === itemId);

        if (item) {
            selectFolder(item);
        }
    };

    const submitNewFolderAndSelect = (basepath: string, label: string) => {
        const itemPath = path.join(basepath, label);
        onSubmitInput({
            label,
            id: uuid(),
            path: itemPath,
            type: 'FOLDER',
            action: 'NEW',
            availableOffline: false,
        });

        const item = getItemByPath(itemPath);

        if (item) {
            selectFolder(item);
        }
    };

    const onDocumentChangeHandler = (document: Document) => {
        setSelectedDocument(document);
        const item = selectedFileNode?.id
            ? getItemById(selectedFileNode.id)
            : undefined;

        if (document.name !== '' && item && item.label !== document.name) {
            return renameNode(decodedDriveID, item.id, document.name);
        }
    };

    const onOpenSwitchboardLink = async () => {
        const doc = getDocumentById(decodedDriveID, selectedFileNode?.id || '');
        await openSwitchboardLink(doc);
    };

    return (
        <div className="flex h-full flex-col overflow-auto bg-gray-100 p-6">
            {selectedFileNode && selectedDocument ? (
                <div className="flex-1 rounded-2xl bg-gray-50 p-4">
                    <Suspense
                        fallback={
                            <div className="flex h-full animate-pulse items-center justify-center">
                                <h3 className="text-xl">Loading editor</h3>
                            </div>
                        }
                    >
                        <DocumentEditor
                            document={selectedDocument}
                            onClose={() => {
                                navigateToItemId(
                                    selectedFileNode.parentFolder ?? driveID,
                                );
                                setSelectedFileNode(undefined);
                            }}
                            onChange={onDocumentChangeHandler}
                            onExport={() => exportDocument(selectedDocument)}
                            onAddOperation={handleAddOperation}
                            {...(isRemoteDrive && { onOpenSwitchboardLink })}
                        />
                    </Suspense>
                </div>
            ) : (
                <>
                    <div className="grow overflow-auto rounded-2xl bg-gray-50 p-2">
                        {selectedPath && (
                            <Breadcrumbs
                                filterPath={selectedPath}
                                onItemClick={(e, itemPath) => {
                                    const item = getItemByPath(itemPath);
                                    if (item) {
                                        selectFolder(item);
                                    }
                                }}
                                onAddNewItem={() => undefined}
                                onSubmitInput={submitNewFolderAndSelect}
                                onCancelInput={console.log}
                                isAllowedToCreateDocuments={
                                    isAllowedToCreateDocuments
                                }
                            />
                        )}
                        {connectConfig.content.showSearchBar && <SearchBar />}
                        <div className="px-4">
                            <div className="mb-5">
                                <FolderView
                                    drive={decodedDriveID}
                                    path={selectedPath || ''}
                                    onFolderSelected={onFolderSelectedHandler}
                                    onFileSelected={(drive, id) => {
                                        setSelectedFileNode({
                                            drive,
                                            id,
                                            parentFolder:
                                                selectedFolder?.id ?? null,
                                        });
                                        navigateToItemId(id);
                                    }}
                                    onFileDeleted={deleteNode}
                                />
                            </div>
                            {isAllowedToCreateDocuments && (
                                <>
                                    <h3 className="mb-3 mt-4 text-xl font-bold text-gray-600">
                                        New document
                                    </h3>
                                    <div className="flex w-full flex-wrap gap-4">
                                        {documentModels.map(doc => (
                                            <Button
                                                key={doc.documentModel.id}
                                                aria-details={
                                                    doc.documentModel
                                                        .description
                                                }
                                                className="bg-gray-200 text-slate-800"
                                                onClick={() =>
                                                    createDocument(doc)
                                                }
                                            >
                                                <span className="text-sm">
                                                    {getDocumentModelName(
                                                        doc.documentModel.name,
                                                    )}
                                                </span>
                                            </Button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export const element = <Content />;
export default Content;
