import { AddDriveModal } from './modals/AddDriveModal';
import { CookiesPolicyModal } from './modals/CookiesPolicyModal';
import { CreateDocumentModal } from './modals/CreateDocumentModal';
import { DebugSettingsModal } from './modals/DebugSettingsModal';
import { DeleteDriveModal } from './modals/DeleteDriveModal';
import { DeleteNodeModal } from './modals/DeleteNodeModal';
import { DisclaimerModal } from './modals/DisclaimerModal';
import { DriveSettingsModal } from './modals/DriveSettingsModal';
import { ExportWithErrorsModal } from './modals/ExportWithErrorsModal';
import { SettingsModal } from './modals/SettingsModal';
import { UpgradeDriveModal } from './modals/UpgradeDriveModal';

export function ModalsContainer() {
    return (
        <>
            <DeleteNodeModal />
            <UpgradeDriveModal />
            <CreateDocumentModal />
            <AddDriveModal />
            <DriveSettingsModal />
            <SettingsModal />
            <DeleteDriveModal />
            {/* <DebugSettingsModal /> */}
            <DisclaimerModal />
            <CookiesPolicyModal />
            <ExportWithErrorsModal />
        </>
    );
}
