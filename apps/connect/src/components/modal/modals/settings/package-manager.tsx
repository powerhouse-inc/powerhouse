import { PackageManager as BasePackageManager } from '@powerhousedao/design-system';
import CommonManifest from 'document-model-libs/manifest';
import { Manifest } from 'document-model/document';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useDocumentDrives } from 'src/hooks/useDocumentDrives';
import { addExternalPackage, removeExternalPackage } from 'src/services/hmr';
import { useExternalPackages } from 'src/store/external-packages';

const LOCAL_REACTOR_VALUE = 'local-reactor';
const LOCAL_REACTOR_LABEL = 'Local Reactor';

function manifestToDetails(manifest: Manifest, id: string) {
    const documentModels = manifest.documentModels.map(
        dm => `Document Model: ${dm.name}`,
    );
    const editors = manifest.editors.map(editor => `Editor: ${editor.name}`);
    return {
        id,
        ...manifest,
        publisher: manifest.publisher.name,
        publisherUrl: manifest.publisher.url,
        modules: documentModels.concat(editors),
    };
}

export interface SettingsModalProps {
    open: boolean;
    onClose: () => void;
    onRefresh: () => void;
}

export const PackageManager: React.FC = () => {
    // Package Manager
    const packages = useExternalPackages();
    const [drives] = useDocumentDrives();
    const [reactor, setReactor] = useState('');

    const options = useMemo(() => {
        return drives.reduce<
            { value: string; label: string; disabled: boolean }[]
        >((acc, drive) => {
            const trigger = drive.state.local.triggers.find(
                trigger => trigger.data?.url,
            );
            if (!trigger?.data?.url) {
                return acc;
            }

            const url = new URL(trigger.data.url);
            const isLocal =
                url.hostname === 'localhost' || url.hostname === '127.0.0.1';
            const label = drive.state.global.name;

            acc.push({
                value: isLocal ? LOCAL_REACTOR_VALUE : trigger.data.url,
                label: isLocal ? LOCAL_REACTOR_LABEL : label,
                disabled: !isLocal,
            });
            return acc;
        }, []);
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

    // TODO packages should be filtered by reactor
    const packagesInfo = useMemo(() => {
        return [manifestToDetails(CommonManifest, 'common')].concat(
            ...packages.map(pkg => manifestToDetails(pkg.manifest, pkg.id)),
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
            reactorOptions={options}
            reactor={reactor}
            packages={packagesInfo}
            onReactorChange={handleReactorChange}
            onInstall={handleInstall}
            onUninstall={handleUninstall}
        />
    );
};
