import {
    ConnectDeleteDriveModal,
    type UiDriveNode,
} from '@powerhousedao/design-system';
import { useTranslation } from 'react-i18next';

export interface DeleteDriveModalProps {
    uiDriveNode: UiDriveNode;
    open: boolean;
    onClose: () => void;
    onDelete: (closeModal: () => void) => void;
}

export const DeleteDriveModal: React.FC<DeleteDriveModalProps> = props => {
    const { open, onClose, uiDriveNode, onDelete } = props;

    const { t } = useTranslation();

    return (
        <ConnectDeleteDriveModal
            open={open}
            driveName={uiDriveNode.name}
            onCancel={onClose}
            header={t('modals.deleteDrive.title', { label: uiDriveNode.name })}
            body={t('modals.deleteDrive.body')}
            inputPlaceholder={t('modals.deleteDrive.inputPlaceholder')}
            cancelLabel={t('common.cancel')}
            continueLabel={t('common.delete')}
            onContinue={() => onDelete(onClose)}
            onOpenChange={(status: boolean) => {
                if (!status) return onClose();
            }}
        />
    );
};
