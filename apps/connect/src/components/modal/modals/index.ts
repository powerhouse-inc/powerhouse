import { AddDriveModal } from './AddDriveModal.js';
import { ConfirmationModal } from './ConfirmationModal.js';
import { CookiesPolicyModal } from './CookiesPolicyModal.js';
import { CreateDocumentModal } from './CreateDocumentModal.js';
import { DebugSettingsModal } from './DebugSettingsModal.js';
import { DeleteDriveModal } from './DeleteDriveModal.js';
import { DeleteItemModal } from './DeleteItemModal.js';
import { DisclaimerModal } from './DisclaimerModal.js';
import { DriveSettingsModal } from './DriveSettingsModal.js';
import { SettingsModal } from './SettingsModal.js';
import { UpgradeDriveModal } from './UpgradeDriveModal.js';

export const modals = {
    deleteItem: DeleteItemModal,
    upgradeDrive: UpgradeDriveModal,
    createDocument: CreateDocumentModal,
    addDriveModal: AddDriveModal,
    driveSettings: DriveSettingsModal,
    settingsModal: SettingsModal,
    confirmationModal: ConfirmationModal,
    deleteDriveModal: DeleteDriveModal,
    debugSettingsModal: DebugSettingsModal,
    disclaimerModal: DisclaimerModal,
    cookiesPolicy: CookiesPolicyModal,
} as const;

export type Modals = typeof modals;

export type ModalType = keyof Modals;

export type ModalPropsMapping = {
    [K in ModalType]: React.ComponentProps<Modals[K]>;
};
