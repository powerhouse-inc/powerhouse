import { type TUiNodes } from '#hooks';
import { sortUiNodesByName } from '#utils';
import {
    FILE,
    FOLDER,
    FolderItem,
    useDrop,
    type BaseUiFolderNode,
    type BaseUiNode,
    type UiFolderNode,
} from '@powerhousedao/design-system';
import { useTranslation } from 'react-i18next';
import { twMerge } from 'tailwind-merge';
import { ContentSection } from './content/index.js';
import FileContentView from './file-content-view.js';

export function FolderView(props: TUiNodes) {
    const { t } = useTranslation();
    const { selectedParentNode } = props;
    const { isDropTarget, dropProps } = useDrop({
        ...props,
        uiNode: selectedParentNode,
    });

    const handleSelectNode = (node: BaseUiFolderNode) => {
        props.setSelectedNode(node as unknown as UiFolderNode);
    };

    const handleRenameNode = (name: string, node: BaseUiFolderNode) => {
        props.onRenameNode(name, node as unknown as UiFolderNode);
    };

    const handleDuplicateNode = (node: BaseUiFolderNode) => {
        props.onDuplicateNode(node as unknown as UiFolderNode);
    };

    const handleDeleteNode = (node: BaseUiFolderNode) => {
        props.onDeleteNode(node as unknown as UiFolderNode);
    };

    const handleAddFile = async (file: File, parentNode: BaseUiNode | null) => {
        await props.onAddFile(
            file,
            parentNode as unknown as UiFolderNode | null,
        );
    };

    const handleCopyNode = async (node: BaseUiNode, targetNode: BaseUiNode) => {
        await props.onCopyNode(
            node as unknown as UiFolderNode,
            targetNode as unknown as UiFolderNode,
        );
    };

    const handleMoveNode = async (node: BaseUiNode, targetNode: BaseUiNode) => {
        await props.onMoveNode(
            node as unknown as UiFolderNode,
            targetNode as unknown as UiFolderNode,
        );
    };

    const folderNodes =
        selectedParentNode?.children
            .filter(node => node.kind === FOLDER)
            .sort(sortUiNodesByName) ?? [];

    const fileNodes =
        selectedParentNode?.children
            .filter(node => node.kind === FILE)
            .sort(sortUiNodesByName) ?? [];

    return (
        <div
            {...dropProps}
            className={twMerge(
                'rounded-md border-2 border-transparent p-2',
                isDropTarget && 'border-dashed border-blue-100',
            )}
        >
            <ContentSection
                title={t('folderView.sections.folders.title')}
                className="mb-4"
            >
                {folderNodes.length > 0 ? (
                    folderNodes.map(folderNode => (
                        <FolderItem
                            key={folderNode.id}
                            uiNode={folderNode}
                            onSelectNode={handleSelectNode}
                            onRenameNode={handleRenameNode}
                            onDuplicateNode={handleDuplicateNode}
                            onDeleteNode={handleDeleteNode}
                            onAddFile={handleAddFile}
                            onCopyNode={handleCopyNode}
                            onMoveNode={handleMoveNode}
                            isAllowedToCreateDocuments={
                                props.isAllowedToCreateDocuments ?? false
                            }
                        />
                    ))
                ) : (
                    <div className="mb-8 text-sm text-gray-400">
                        {t('folderView.sections.folders.empty')}
                    </div>
                )}
            </ContentSection>
            <ContentSection title={t('folderView.sections.documents.title')}>
                <div
                    className={twMerge(
                        'w-full',
                        fileNodes.length > 0 ? 'min-h-[400px]' : 'min-h-14',
                    )}
                >
                    <FileContentView {...props} fileNodes={fileNodes} />
                </div>
            </ContentSection>
        </div>
    );
}

export default FolderView;
