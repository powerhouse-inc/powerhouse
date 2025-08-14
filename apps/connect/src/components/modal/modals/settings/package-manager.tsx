import { addExternalPackage, removeExternalPackage } from '#services';
import { PH_PACKAGES } from '@powerhousedao/config/packages';
import { PackageManager as BasePackageManager } from '@powerhousedao/design-system';
import {
    makeVetraPackageManifest,
    useDrives,
    useVetraPackages,
} from '@powerhousedao/state';
import { type Manifest } from 'document-model';
import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

const LOCAL_REACTOR_VALUE = 'local-reactor';
const LOCAL_REACTOR_LABEL = 'Local Reactor';

function manifestToDetails(
    manifest: Manifest | undefined,
    id: string,
    removable: boolean,
) {
    if (!manifest) {
        return undefined;
    }

    const documentModels =
        manifest.documentModels?.map(dm => `Document Model: ${dm.name}`) ?? [];
    const editors =
        manifest.editors?.map(editor => `Editor: ${editor.name}`) ?? [];
    const apps = manifest.apps?.map(app => `App: ${app.name}`) ?? [];
    return {
        id,
        ...manifest,
        publisher: manifest.publisher.name,
        publisherUrl: manifest.publisher.url,
        modules: documentModels.concat(editors).concat(apps),
        removable,
    };
}

export interface SettingsModalProps {
    open: boolean;
    onClose: () => void;
    onRefresh: () => void;
}

export const PackageManager: React.FC = () => {
    const vetraPackages = useVetraPackages();
    const drives = useDrives();
    const [reactor, setReactor] = useState('');

    const options = useMemo(() => {
        return drives?.reduce<
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
            const defaultOption = options?.find(option => !option.disabled);
            if (reactor && options?.find(option => option.value === reactor)) {
                return reactor;
            } else {
                return defaultOption?.value ?? '';
            }
        });
    }, [reactor, options]);

    const packagesInfo = vetraPackages?.map(pkg =>
        makeVetraPackageManifest(pkg),
    );

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
            mutable={true}
            reactorOptions={options ?? []}
            reactor={reactor}
            packages={
                packagesInfo?.map(pkg => ({
                    id: pkg.id,
                    name: pkg.name,
                    description: pkg.description,
                    category: pkg.category,
                    publisher: pkg.author.name,
                    publisherUrl: pkg.author.website ?? '',
                    modules: Object.values(pkg.modules).flatMap(modules =>
                        modules.map(module => module.name),
                    ),
                    removable: true,
                })) ?? []
            }
            onReactorChange={handleReactorChange}
            onInstall={handleInstall}
            onUninstall={handleUninstall}
            packageOptions={PH_PACKAGES}
        />
    );
};
