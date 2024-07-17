import {
    FILE,
    FOLDER,
    FolderItem,
    UiDriveNode,
    UiFolderNode,
    useDraggableTarget,
} from '@powerhousedao/design-system';
import { useTranslation } from 'react-i18next';
import { useDrivesContainer } from 'src/hooks/useDrivesContainer';
import { useOnDropEvent } from 'src/hooks/useOnDropEvent';
import { sortUiNodesByName } from 'src/utils';
import { twMerge } from 'tailwind-merge';
import { ContentSection } from './content';
import FileContentView from './file-content-view';

interface IProps {
    selectedParentNode: UiDriveNode | UiFolderNode;
    isAllowedToCreateDocuments: boolean;
    isRemoteDrive: boolean;
}

export const FolderView: React.FC<IProps> = ({
    selectedParentNode,
    isAllowedToCreateDocuments,
    isRemoteDrive,
}) => {
    const { t } = useTranslation();
    const { allowedDropdownMenuOptions, nodeHandlers, dragAndDropHandlers } =
        useDrivesContainer();
    const onDropEvent = useOnDropEvent();
    const { dropProps, isDropTarget } = useDraggableTarget({
        data: selectedParentNode,
        onDropEvent,
    });

    const folderNodes = selectedParentNode.children
        .filter(node => node.kind === FOLDER)
        .sort(sortUiNodesByName);

    const fileNodes = selectedParentNode.children
        .filter(node => node.kind === FILE)
        .sort(sortUiNodesByName);

    return (
        <div
            {...dropProps}
            className={twMerge(
                'rounded-md border-2 border-dashed border-transparent p-2',
                isDropTarget && 'border-blue-100',
            )}
        >
            <ContentSection
                title={t('folderView.sections.folders.title')}
                className="mb-4"
            >
                {folderNodes.length > 0 ? (
                    folderNodes.map(folderNode => (
                        <FolderItem
                            {...nodeHandlers}
                            {...dragAndDropHandlers}
                            key={folderNode.id}
                            uiFolderNode={folderNode}
                            allowedDropdownMenuOptions={
                                allowedDropdownMenuOptions[FOLDER]
                            }
                            isAllowedToCreateDocuments={
                                isAllowedToCreateDocuments
                            }
                            displaySyncIcon={isRemoteDrive}
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
                    // eslint-disable-next-line tailwindcss/no-arbitrary-value
                    className={twMerge(
                        'w-full',
                        fileNodes.length > 0 ? 'min-h-[400px]' : 'min-h-14',
                    )}
                >
                    <FileContentView
                        fileNodes={fileNodes}
                        isRemoteDrive={isRemoteDrive}
                        isAllowedToCreateDocuments={isAllowedToCreateDocuments}
                    />
                </div>
            </ContentSection>
        </div>
    );
};

export default FolderView;
