import {
    DefaultRemoteDriveInfo,
    DocumentDriveServerOptions,
    DriveEvents,
    IBaseDocumentDriveServer,
    IReadModeDriveServer,
    RemoteDriveAccessLevel,
    RemoveOldRemoteDrivesOption
} from '../server';
import { DriveNotFoundError } from '../server/error';
import { requestPublicDrive } from './graphql';
import { logger } from './logger';

export interface IServerDelegateDrivesManager {
    emit: (...args: Parameters<DriveEvents['defaultRemoteDrive']>) => void;
}

function isReadModeDriveServer(obj: unknown): obj is IReadModeDriveServer {
    return typeof (obj as IReadModeDriveServer).getReadDrives === 'function';
}

export interface IDefaultDrivesManager {
    getDefaultRemoteDrives(): Map<string, DefaultRemoteDriveInfo>;
    setDefaultDriveAccessLevel(
        url: string,
        level: RemoteDriveAccessLevel
    ): Promise<void>;
    setAllDefaultDrivesAccessLevel(
        level: RemoteDriveAccessLevel
    ): Promise<void>;
}

export class DefaultDrivesManager implements IDefaultDrivesManager {
    private defaultRemoteDrives = new Map<string, DefaultRemoteDriveInfo>();
    private removeOldRemoteDrivesConfig: RemoveOldRemoteDrivesOption;

    constructor(
        private server:
            | IBaseDocumentDriveServer
            | (IBaseDocumentDriveServer & IReadModeDriveServer),
        private delegate: IServerDelegateDrivesManager,
        options?: Pick<DocumentDriveServerOptions, 'defaultDrives'>
    ) {
        if (options?.defaultDrives.remoteDrives) {
            for (const defaultDrive of options.defaultDrives.remoteDrives) {
                this.defaultRemoteDrives.set(defaultDrive.url, {
                    ...defaultDrive,
                    status: 'PENDING'
                });
            }
        }

        this.removeOldRemoteDrivesConfig = options?.defaultDrives
            .removeOldRemoteDrives || {
            strategy: 'preserve-all'
        };
    }

    getDefaultRemoteDrives() {
        return new Map(
            JSON.parse(
                JSON.stringify(Array.from(this.defaultRemoteDrives))
            ) as Iterable<[string, DefaultRemoteDriveInfo]>
        );
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

    async setAllDefaultDrivesAccessLevel(level: RemoteDriveAccessLevel) {
        const drives = this.defaultRemoteDrives.values();
        for (const drive of drives) {
            await this.setDefaultDriveAccessLevel(drive.url, level);
        }
    }

    async setDefaultDriveAccessLevel(
        url: string,
        level: RemoteDriveAccessLevel
    ) {
        const drive = this.defaultRemoteDrives.get(url);
        if (drive && drive.options.accessLevel !== level) {
            const newDriveValue = {
                ...drive,
                options: { ...drive.options, accessLevel: level }
            };
            this.defaultRemoteDrives.set(url, newDriveValue);
            await this.initializeDefaultRemoteDrives([newDriveValue]);
        }
    }

    async initializeDefaultRemoteDrives(
        defaultDrives: DefaultRemoteDriveInfo[] = Array.from(
            this.defaultRemoteDrives.values()
        )
    ) {
        const drives = await this.server.getDrives();
        const readServer = isReadModeDriveServer(this.server)
            ? (this.server as IReadModeDriveServer)
            : undefined;
        const readDrives = await readServer?.getReadDrives();

        for (const remoteDrive of defaultDrives) {
            let remoteDriveInfo = { ...remoteDrive };

            try {
                const driveInfo = await requestPublicDrive(remoteDrive.url);

                remoteDriveInfo = { ...remoteDrive, metadata: driveInfo };

                this.defaultRemoteDrives.set(remoteDrive.url, remoteDriveInfo);

                const driveIsAdded = drives.includes(driveInfo.id);
                const readDriveIsAdded = readDrives?.includes(driveInfo.id);

                const readMode =
                    readServer && remoteDrive.options.accessLevel === 'READ';
                const isAdded = readMode ? readDriveIsAdded : driveIsAdded;

                // if the read mode has changed then existing drives
                // in the previous mode should be deleted
                const driveToDelete = readMode
                    ? driveIsAdded
                    : readDriveIsAdded;
                if (driveToDelete) {
                    try {
                        await (readMode
                            ? this.server.deleteDrive(driveInfo.id)
                            : readServer?.deleteReadDrive(driveInfo.id));
                    } catch (e) {
                        logger.error(e);
                    }
                }

                if (isAdded) {
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
