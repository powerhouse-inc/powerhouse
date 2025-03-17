import {
    Icon,
    SettingsModal as SettingsModalV2,
} from '@powerhousedao/design-system';
import { t } from 'i18next';
import type React from 'react';
import { useCallback, useMemo } from 'react';
import { About } from './settings/about.js';
import { DangerZone } from './settings/danger-zone.js';
import { DefaultEditor } from './settings/default-editor.js';
import { PackageManager } from './settings/package-manager.js';

export interface SettingsModalProps {
    open: boolean;
    onClose: () => void;
    onRefresh: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = props => {
    const { open, onClose, onRefresh } = props;

    const tabs = useMemo(
        () => [
            {
                id: 'package-manager',
                icon: <Icon name="PackageManager" size={12} />,
                label: 'Package Manager',
                content: PackageManager,
            },
            {
                id: 'default-editors',
                icon: <Icon name="Edit" size={12} />,
                label: 'Default Editors',
                content: DefaultEditor,
            },
            {
                id: 'danger-zone',
                icon: <Icon name="Danger" size={12} className="text-red-900" />,
                label: <span className="text-red-900">Danger Zone</span>,
                content: () => <DangerZone onRefresh={onRefresh} />,
            },
            {
                id: 'about',
                icon: <Icon name="QuestionSquare" size={12} />,
                label: 'About',
                content: About,
            },
        ],
        [onRefresh],
    );

    const handleOpenChange = useCallback(
        (status: boolean) => {
            if (!status) return onClose();
        },
        [onClose],
    );

    return (
        <SettingsModalV2
            open={open}
            title={t('modals.connectSettings.title')}
            onOpenChange={handleOpenChange}
            tabs={tabs}
        />
    );
};
