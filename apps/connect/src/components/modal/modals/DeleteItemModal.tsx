import { ConnectDeleteItemModal } from '@powerhousedao/design-system';
import { useNodeKind } from '@powerhousedao/reactor-browser';
import type React from 'react';
import { useTranslation } from 'react-i18next';

export interface DeleteItemModalProps {
    nodeId: string | null;
    open: boolean;
    onDelete: (closeModal: () => void) => void;
    onClose: () => void;
}

export const DeleteItemModal: React.FC<DeleteItemModalProps> = props => {
    const { t } = useTranslation();
    const { nodeId, open, onClose, onDelete } = props;
    const kind = useNodeKind(nodeId);

    return (
        <ConnectDeleteItemModal
            open={open}
            onDelete={() => onDelete(onClose)}
            onCancel={() => onClose()}
            header={t(`modals.deleteItem.${kind!.toLowerCase()}.header`, {
                item: name,
            })}
            body={t(`modals.deleteItem.${kind!.toLowerCase()}.body`)}
            cancelLabel={t('common.cancel')}
            deleteLabel={t('common.delete')}
        />
    );
};
