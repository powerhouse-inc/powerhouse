import {
    FILE,
    FOLDER,
    FolderItem,
    useDrop,
} from '@powerhousedao/design-system';
import { useTranslation } from 'react-i18next';
import { TUiNodes } from 'src/hooks/useUiNodes';
import { sortUiNodesByName } from 'src/utils';
import { twMerge } from 'tailwind-merge';
import { ContentSection } from './content';
import FileContentView from './file-content-view';

export function FolderView(props: TUiNodes) {
    const { t } = useTranslation();
    const { selectedParentNode } = props;
    const { isDropTarget, dropProps } = useDrop({
        ...props,
        uiNode: selectedParentNode,
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
                            {...props}
                            key={folderNode.id}
                            uiNode={folderNode}
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
