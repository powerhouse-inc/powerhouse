import { PackageManager as BasePackageManager } from '@powerhousedao/design-system';
import CommonManifest from 'document-model-libs/manifest';
import { Manifest } from 'document-model/document';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useDocumentDrives } from 'src/hooks/useDocumentDrives';
import { addExternalPackage, removeExternalPackage } from 'src/services/hmr';
import {
    useExternalPackages,
    useMutableExternalPackages,
} from 'src/store/external-packages';

const LOCAL_REACTOR_VALUE = 'local-reactor';
const LOCAL_REACTOR_LABEL = 'Local Reactor';

function manifestToDetails(manifest: Manifest, id: string, removable: boolean) {
    const documentModels = manifest.documentModels.map(
        dm => `Document Model: ${dm.name}`,
    );
    const editors = manifest.editors.map(editor => `Editor: ${editor.name}`);
    const apps = manifest.apps?.map(app => `App: ${app.name}`);
    return {
        id,
        ...manifest,
        publisher: manifest.publisher.name,
        publisherUrl: manifest.publisher.url,
        modules: documentModels.concat(editors).concat(apps ?? []),
        removable,
    };
}

export interface SettingsModalProps {
    open: boolean;
    onClose: () => void;
    onRefresh: () => void;
}

export const PackageManager: React.FC = () => {
    const packages = useExternalPackages();
    const isMutable = useMutableExternalPackages();
    const [drives] = useDocumentDrives();
    const [reactor, setReactor] = useState('');

    const options = useMemo(() => {
        return drives.reduce<
            { value: string; label: string; disabled: boolean }[]
        >(
            (acc, drive) => {
                const trigger = drive.state.local.triggers.find(
                    trigger => trigger.data?.url,
                );
                if (!trigger?.data?.url) {
                    return acc;
                }

                const value = trigger.data.url;
                const label = drive.state.global.name;

                acc.push({
                    value,
                    label,
                    disabled: true,
                });
                return acc;
            },
            [
                {
                    value: LOCAL_REACTOR_VALUE,
                    label: LOCAL_REACTOR_LABEL,
                    disabled: false,
                },
            ],
        );
    }, [drives]);

    useEffect(() => {
        setReactor(reactor => {
            const defaultOption = options.find(option => !option.disabled);
            if (reactor && options.find(option => option.value === reactor)) {
                return reactor;
            } else {
                return defaultOption?.value ?? '';
            }
        });
    }, [reactor, options]);

    const packagesInfo = useMemo(() => {
        return [manifestToDetails(CommonManifest, 'common', false)].concat(
            ...packages.map(pkg =>
                manifestToDetails(pkg.manifest, pkg.id, true),
            ),
        );
    }, [packages]);

    const handleReactorChange = useCallback(
        (reactor?: string) => setReactor(reactor ?? ''),
        [],
    );
    const handleInstall = useCallback(
        (packageName: string) => {
            if (reactor !== LOCAL_REACTOR_VALUE) {
                throw new Error(
                    'Cannot install external package on a remote reactor',
                );
            }
            return addExternalPackage(packageName);
        },
        [reactor],
    );

    const handleUninstall = useCallback(
        (packageName: string) => {
            if (reactor !== LOCAL_REACTOR_VALUE) {
                throw new Error(
                    'Cannot delete external package on a remote reactor',
                );
            }
            return removeExternalPackage(packageName);
        },
        [reactor],
    );

    return (
        <BasePackageManager
            mutable={isMutable}
            reactorOptions={options}
            reactor={reactor}
            packages={packagesInfo}
            onReactorChange={handleReactorChange}
            onInstall={handleInstall}
            onUninstall={handleUninstall}
        />
    );
};
