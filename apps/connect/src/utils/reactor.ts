import {
    DefaultRemoteDriveInput,
    DocumentDriveServerOptions,
} from 'document-drive/server';

const DEFAULT_DRIVES_URL =
    import.meta.env.PH_CONNECT_DEFAULT_DRIVES_URL || undefined;
const defaultDrivesUrl = DEFAULT_DRIVES_URL
    ? DEFAULT_DRIVES_URL.split(',')
    : [];

export const getReactorDefaultDrivesConfig = (): Pick<
    DocumentDriveServerOptions,
    'defaultDrives'
> => {
    const remoteDrives: DefaultRemoteDriveInput[] = defaultDrivesUrl.map(
        driveUrl => ({
            url: driveUrl,
            options: {
                accessLevel: 'READ',
                sharingType: 'PUBLIC',
                availableOffline: true,
                listeners: [
                    {
                        block: true,
                        callInfo: {
                            data: driveUrl,
                            name: 'switchboard-push',
                            transmitterType: 'SwitchboardPush',
                        },
                        filter: {
                            branch: ['main'],
                            documentId: ['*'],
                            documentType: ['*'],
                            scope: ['global'],
                        },
                        label: 'Switchboard Sync',
                        listenerId: '1',
                        system: true,
                    },
                ],
                triggers: [],
                pullInterval: 3000,
            },
        }),
    );

    return {
        defaultDrives: {
            remoteDrives,
            removeOldRemoteDrives:
                defaultDrivesUrl.length > 0
                    ? {
                          strategy: 'preserve-by-url',
                          urls: defaultDrivesUrl,
                      }
                    : { strategy: 'preserve-all' },
        },
    };
};
