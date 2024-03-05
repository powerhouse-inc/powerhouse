import { ConfirmationModal } from './ConfirmationModal';
import { CreateDocumentModal } from './CreateDocumentModal';
import { DeleteItemModal } from './DeleteItemModal';
import { SettingsModal } from './SettingsModal';
import { UpgradeDriveModal } from './UpgradeDriveModal';

export const modals = {
    deleteItem: DeleteItemModal,
    upgradeDrive: UpgradeDriveModal,
    createDocument: CreateDocumentModal,
    settingsModal: SettingsModal,
    confirmationModal: ConfirmationModal,
} as const;

export type Modals = typeof modals;

export type ModalType = keyof Modals;

export type ModalPropsMapping = {
    [K in ModalType]: React.ComponentProps<Modals[K]>;
};
