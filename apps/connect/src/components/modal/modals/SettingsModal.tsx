import { Button, Modal } from '@powerhousedao/design-system';
import React from 'react';
import { useDocumentDriveServer } from 'src/hooks/useDocumentDriveServer';

export interface SettingsModalProps {
    open: boolean;
    onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = props => {
    const { open, onClose } = props;
    const { clearStorage } = useDocumentDriveServer();

    const onClearStorage = () => {
        clearStorage().catch(console.error);
        onClose();
    };

    return (
        <Modal
            open={open}
            contentProps={{
                className: 'rounded-3xl',
            }}
            onOpenChange={status => {
                if (!status) return onClose();
            }}
        >
            <div className="w-[400px] p-6 text-slate-300">
                <div className="border-b border-slate-50 pb-2 text-2xl font-bold text-gray-800">
                    Settings
                </div>
                <div className="mt-8 flex items-center justify-between gap-3">
                    <p>Clear storage:</p>
                    <Button
                        onClick={onClearStorage}
                        className="min-h-[48px] min-w-[142px] rounded-xl bg-red-900 px-6 py-3 text-base font-semibold text-gray-50 outline-none transition-all hover:scale-105 active:opacity-75"
                    >
                        Clear
                    </Button>
                </div>
            </div>
        </Modal>
    );
};
