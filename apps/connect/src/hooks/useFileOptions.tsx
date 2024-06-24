import {
    FileItemProps,
    Icon,
    TreeItem,
    defaultDropdownMenuOptions,
} from '@powerhousedao/design-system';
import { useTranslation } from 'react-i18next';
import { useModal } from 'src/components/modal';
import { useDocumentDriveById } from 'src/hooks/useDocumentDriveById';
import { useDrivesContainer } from 'src/hooks/useDrivesContainer';
import { useGetDocumentById } from 'src/hooks/useGetDocumentById';
import { useOpenSwitchboardLink } from 'src/hooks/useOpenSwitchboardLink';

export type SetIsWriteMode = (isWriteMode: boolean) => void;

const allowedItemOptions = ['delete', 'rename', 'duplicate'];

const defaultItemOptions = defaultDropdownMenuOptions.filter(option =>
    allowedItemOptions.includes(option.id),
);

export function useFileOptions(decodedDriveID: string) {
    const { showModal } = useModal();
    const { onSubmitInput } = useDrivesContainer();
    const getDocumentById = useGetDocumentById();
    const { t } = useTranslation();
    const openSwitchboardLink = useOpenSwitchboardLink(decodedDriveID);
    const { isRemoteDrive } = useDocumentDriveById(decodedDriveID);

    const onFileOptionsClick = async (
        optionId: string,
        fileNode: TreeItem,
        setIsWriteMode: SetIsWriteMode,
    ) => {
        if (optionId === 'delete') {
            showModal('deleteItem', {
                driveId: decodedDriveID,
                itemId: fileNode.id,
                itemName: fileNode.label,
                type: 'file',
            });
        }
        if (optionId === 'duplicate') {
            await onSubmitInput({
                ...fileNode,
                action: 'UPDATE_AND_COPY',
            });
        }

        if (optionId === 'rename') {
            setIsWriteMode(true);
        }

        if (optionId === 'switchboard-link') {
            const document = getDocumentById(decodedDriveID, fileNode.id);

            await openSwitchboardLink(document);
        }
    };

    const fileItemOptions: FileItemProps['itemOptions'] = isRemoteDrive
        ? [
              {
                  id: 'switchboard-link',
                  label: t('files.options.switchboardLink'),
                  icon: (
                      <div className="flex w-6 justify-center">
                          <Icon name="drive" size={16} />
                      </div>
                  ),
              },
              ...defaultItemOptions,
          ]
        : defaultItemOptions;

    return {
        onFileOptionsClick,
        fileItemOptions,
    };
}
