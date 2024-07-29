import {
    FILE,
    FOLDER,
    FolderItem,
    UiNode,
    useDraggableTarget,
} from '@powerhousedao/design-system';
import { useTranslation } from 'react-i18next';
import { useOnDropEvent } from 'src/hooks/useOnDropEvent';
import { UiNodes } from 'src/hooks/useUiNodes';
import { sortUiNodesByName } from 'src/utils';
import { twMerge } from 'tailwind-merge';
import { ContentSection } from './content';
import FileContentView from './file-content-view';

export function FolderView(props: UiNodes) {
    const { t } = useTranslation();
    const { selectedParentNode } = props;
    const onDropEvent = useOnDropEvent();
    const { dropProps, isDropTarget } = useDraggableTarget<UiNode | null>({
        data: selectedParentNode,
        onDropEvent,
    });

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
                            {...props}
                            key={folderNode.id}
                            uiFolderNode={folderNode}
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
                    <FileContentView {...props} fileNodes={fileNodes} />
                </div>
            </ContentSection>
        </div>
    );
}

export default FolderView;
