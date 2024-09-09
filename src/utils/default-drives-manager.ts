import {
    BaseDocumentDriveServer,
    DefaultRemoteDriveInfo,
    DocumentDriveServerOptions,
    DriveEvents,
    RemoveOldRemoteDrivesOption
} from '../server';
import { DriveNotFoundError } from '../server/error';
import { requestPublicDrive } from './graphql';
import { logger } from './logger';

export interface IServerDelegateDrivesManager {
    emit: (...args: Parameters<DriveEvents['defaultRemoteDrive']>) => void;
}

export class DefaultDrivesManager {
    private defaultRemoteDrives = new Map<string, DefaultRemoteDriveInfo>();
    private removeOldRemoteDrivesConfig: RemoveOldRemoteDrivesOption;

    constructor(
        private server: BaseDocumentDriveServer,
        private delegate: IServerDelegateDrivesManager,
        options?: Pick<
            DocumentDriveServerOptions,
            'defaultRemoteDrives' | 'removeOldRemoteDrives'
        >
    ) {
        if (options?.defaultRemoteDrives) {
            for (const defaultDrive of options.defaultRemoteDrives) {
                this.defaultRemoteDrives.set(defaultDrive.url, {
                    ...defaultDrive,
                    status: 'PENDING'
                });
            }
        }

        this.removeOldRemoteDrivesConfig = options?.removeOldRemoteDrives || {
            strategy: 'preserve-all'
        };
    }

    getDefaultRemoteDrives() {
        return this.defaultRemoteDrives;
    }

    private async deleteDriveById(driveId: string) {
        try {
            await this.server.deleteDrive(driveId);
        } catch (error) {
            if (!(error instanceof DriveNotFoundError)) {
                logger.error(error);
            }
        }
    }

    private async preserveDrivesById(
        drivesIdsToRemove: string[],
        drives: string[]
    ) {
        const getAllDrives = drives.map(driveId =>
            this.server.getDrive(driveId)
        );

        const drivesToRemove = (await Promise.all(getAllDrives))
            .filter(
                drive =>
                    drive.state.local.listeners.length > 0 ||
                    drive.state.local.triggers.length > 0
            )
            .filter(
                drive => !drivesIdsToRemove.includes(drive.state.global.id)
            );

        const driveIds = drivesToRemove.map(drive => drive.state.global.id);
        await this.removeDrivesById(driveIds);
    }

    private async removeDrivesById(driveIds: string[]) {
        for (const driveId of driveIds) {
            await this.deleteDriveById(driveId);
        }
    }

    async removeOldremoteDrives() {
        const driveids = await this.server.getDrives();

        switch (this.removeOldRemoteDrivesConfig.strategy) {
            case 'preserve-by-id': {
                await this.preserveDrivesById(
                    this.removeOldRemoteDrivesConfig.ids,
                    driveids
                );
                break;
            }
            case 'preserve-by-url': {
                const getDrivesInfo = this.removeOldRemoteDrivesConfig.urls.map(
                    url => requestPublicDrive(url)
                );

                const drivesIdsToPreserve = (
                    await Promise.all(getDrivesInfo)
                ).map(driveInfo => driveInfo.id);

                await this.preserveDrivesById(drivesIdsToPreserve, driveids);
                break;
            }
            case 'remove-by-id': {
                const drivesIdsToRemove =
                    this.removeOldRemoteDrivesConfig.ids.filter(driveId =>
                        driveids.includes(driveId)
                    );

                await this.removeDrivesById(drivesIdsToRemove);
                break;
            }
            case 'remove-by-url': {
                const getDrivesInfo = this.removeOldRemoteDrivesConfig.urls.map(
                    driveUrl => requestPublicDrive(driveUrl)
                );
                const drivesInfo = await Promise.all(getDrivesInfo);

                const drivesIdsToRemove = drivesInfo
                    .map(driveInfo => driveInfo.id)
                    .filter(driveId => driveids.includes(driveId));

                await this.removeDrivesById(drivesIdsToRemove);
                break;
            }
            case 'remove-all': {
                const getDrives = driveids.map(driveId =>
                    this.server.getDrive(driveId)
                );
                const drives = await Promise.all(getDrives);
                const drivesToRemove = drives
                    .filter(
                        drive =>
                            drive.state.local.listeners.length > 0 ||
                            drive.state.local.triggers.length > 0
                    )
                    .map(drive => drive.state.global.id);

                await this.removeDrivesById(drivesToRemove);
                break;
            }
        }
    }

    async initializeDefaultRemoteDrives() {
        const drives = await this.server.getDrives();

        for (const remoteDrive of this.defaultRemoteDrives.values()) {
            let remoteDriveInfo = { ...remoteDrive };

            try {
                const driveInfo = await requestPublicDrive(remoteDrive.url);

                remoteDriveInfo = { ...remoteDrive, metadata: driveInfo };

                this.defaultRemoteDrives.set(remoteDrive.url, remoteDriveInfo);

                if (drives.includes(driveInfo.id)) {
                    remoteDriveInfo.status = 'ALREADY_ADDED';

                    this.defaultRemoteDrives.set(
                        remoteDrive.url,
                        remoteDriveInfo
                    );
                    this.delegate.emit(
                        'ALREADY_ADDED',
                        this.defaultRemoteDrives,
                        remoteDriveInfo,
                        driveInfo.id,
                        driveInfo.name
                    );
                    continue;
                }

                remoteDriveInfo.status = 'ADDING';

                this.defaultRemoteDrives.set(remoteDrive.url, remoteDriveInfo);
                this.delegate.emit(
                    'ADDING',
                    this.defaultRemoteDrives,
                    remoteDriveInfo
                );

                await this.server.addRemoteDrive(remoteDrive.url, {
                    ...remoteDrive.options,
                    expectedDriveInfo: driveInfo
                });

                remoteDriveInfo.status = 'SUCCESS';

                this.defaultRemoteDrives.set(remoteDrive.url, remoteDriveInfo);
                this.delegate.emit(
                    'SUCCESS',
                    this.defaultRemoteDrives,
                    remoteDriveInfo,
                    driveInfo.id,
                    driveInfo.name
                );
            } catch (error) {
                remoteDriveInfo.status = 'ERROR';

                this.defaultRemoteDrives.set(remoteDrive.url, remoteDriveInfo);
                this.delegate.emit(
                    'ERROR',
                    this.defaultRemoteDrives,
                    remoteDriveInfo,
                    undefined,
                    undefined,
                    error as Error
                );
            }
        }
    }
}
