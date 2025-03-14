import {
    ConnectDeleteItemModal,
    type UiFileNode,
    type UiFolderNode,
} from '@powerhousedao/design-system';
import type React from 'react';
import { useTranslation } from 'react-i18next';

export interface DeleteItemModalProps {
    uiNode: UiFileNode | UiFolderNode;
    open: boolean;
    onDelete: (closeModal: () => void) => void;
    onClose: () => void;
}

export const DeleteItemModal: React.FC<DeleteItemModalProps> = props => {
    const { t } = useTranslation();
    const { uiNode, open, onClose, onDelete } = props;
    const { kind, name } = uiNode;

    return (
        <ConnectDeleteItemModal
            open={open}
            onDelete={() => onDelete(onClose)}
            onCancel={() => onClose()}
            header={t(`modals.deleteItem.${kind.toLowerCase()}.header`, {
                item: name,
            })}
            body={t(`modals.deleteItem.${kind.toLowerCase()}.body`)}
            cancelLabel={t('common.cancel')}
            deleteLabel={t('common.delete')}
        />
    );
};
