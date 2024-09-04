import { DocumentDriveServerOptions } from 'document-drive/server';

const DEFAULT_DRIVES_URL =
    import.meta.env.PH_CONNECT_DEFAULT_DRIVES_URL || undefined;
const defaultDrivesUrl = DEFAULT_DRIVES_URL
    ? DEFAULT_DRIVES_URL.split(',')
    : [];

export const getReactorDefaultDrivesConfig = (): Pick<
    DocumentDriveServerOptions,
    'defaultRemoteDrives' | 'removeOldRemoteDrives'
> => {
    const defaultDrives: DocumentDriveServerOptions['defaultRemoteDrives'] =
        defaultDrivesUrl.map(driveUrl => ({
            url: driveUrl,
            options: {
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
        }));

    return {
        defaultRemoteDrives: defaultDrives,
        removeOldRemoteDrives:
            defaultDrivesUrl.length > 0
                ? {
                      strategy: 'preserve-by-url',
                      urls: defaultDrivesUrl,
                  }
                : { strategy: 'preserve-all' },
    };
};
