import {
    BaseQueueManager,
    BrowserStorage,
    DefaultRemoteDriveInput,
    DocumentDriveServer,
    DocumentDriveServerOptions,
    InMemoryCache,
} from 'document-drive';
import { DocumentModelModule } from 'document-model';

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
                          strategy: 'preserve-by-url-and-detach',
                          urls: defaultDrivesUrl,
                      }
                    : { strategy: 'preserve-all' },
        },
    };
};

export function createBrowserDocumentDriveServer(
    documentModels: DocumentModelModule[],
    routerBasename: string,
) {
    return new DocumentDriveServer(
        documentModels,
        new BrowserStorage(routerBasename),
        new InMemoryCache(),
        new BaseQueueManager(1, 10),
        { ...getReactorDefaultDrivesConfig() },
    );
}
