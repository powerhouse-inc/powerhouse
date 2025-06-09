import { ConnectDeleteItemModal } from '@powerhousedao/design-system';
import { useNodeKind } from '@powerhousedao/reactor-browser';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { useModal} from "@powerhousedao/common"

export const DeleteItemModal: React.FC = () => {
    const { t } = useTranslation();
    const { isOpen, props, show, hide } = useModal('deleteNode');

    if (!isOpen) return null;

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
