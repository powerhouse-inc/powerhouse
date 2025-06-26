import { useModal } from '@powerhousedao/common';
import {
    Icon,
    SettingsModal as SettingsModalV2,
} from '@powerhousedao/design-system';
import { t } from 'i18next';
import type React from 'react';
import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { About } from './settings/about.js';
import { DangerZone } from './settings/danger-zone.js';
import { DefaultEditor } from './settings/default-editor.js';
import { PackageManager } from './settings/package-manager.js';

export const SettingsModal: React.FC = () => {
    const navigate = useNavigate();
    const { isOpen, hide } = useModal('settings');

    const onRefresh = useCallback(() => {
        navigate(0);
    }, [navigate]);

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
                content: () => <DangerZone />,
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
            if (!status) return hide();
        },
        [hide],
    );

    if (!isOpen) return null;

    return (
        <SettingsModalV2
            open={isOpen}
            title={t('modals.connectSettings.title')}
            onOpenChange={handleOpenChange}
            tabs={tabs}
        />
    );
};
