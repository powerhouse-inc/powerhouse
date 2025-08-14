import connectConfig from '#connect-config';
import { type IRenown } from '#services';
import { createBrowserDocumentDriveServer, createBrowserStorage } from '#utils';
import {
    addPHEventHandlers,
    extractDriveSlugFromPath,
    extractNodeSlugFromPath,
    getDocuments,
    getDrives,
    refreshReactorData,
} from '@powerhousedao/state';
import {
    dispatchSetDocumentsEvent,
    dispatchSetDrivesEvent,
    dispatchSetProcessorManagerEvent,
    dispatchSetReactorEvent,
    dispatchSetRenownEvent,
    dispatchSetSelectedDriveIdEvent,
    dispatchSetSelectedNodeIdEvent,
    dispatchSetVetraPackagesEvent,
} from '@powerhousedao/state/internal/events';
import { type User } from '@renown/sdk';
import { logger, type IDocumentDriveServer } from 'document-drive';
import { ProcessorManager } from 'document-drive/processors/processor-manager';
import { generateId } from 'document-model';
import { getConnectCrypto } from '../hooks/useConnectCrypto.js';
import { loadCommonPackage } from './document-model.js';
import { loadExternalPackages } from './external-packages.js';

async function initReactor(
    reactor: IDocumentDriveServer,
    renown: IRenown | undefined,
) {
    await initJwtHandler(reactor, renown);
    const errors = await reactor.initialize();
    const error = errors?.at(0);
    if (error) {
        throw error;
    }
}

export async function handleCreateFirstLocalDrive(
    reactor: IDocumentDriveServer | undefined,
) {
    const localDrivesEnabled = connectConfig.drives.sections.LOCAL.enabled;
    if (!localDrivesEnabled || reactor === undefined) return;

    const drives = await getDrives(reactor);
    const hasDrives = drives.length > 0;
    if (hasDrives) return;

    const driveId = generateId();
    const driveSlug = `my-local-drive-${driveId}`;
    const document = await reactor.addDrive({
        id: driveId,
        slug: driveSlug,
        global: {
            name: 'My Local Drive',
            icon: null,
        },
        local: {
            availableOffline: false,
            sharingType: 'private',
            listeners: [],
            triggers: [],
        },
    });
    console.log('document', document);
    return document;
}

async function initJwtHandler(
    server: IDocumentDriveServer,
    renown: IRenown | undefined,
) {
    const user = await renown?.user();
    const crypto = await getConnectCrypto();

    if (user?.address) {
        server.setGenerateJwtHandler(async driveUrl => {
            return crypto.getBearerToken(driveUrl, user.address);
        });
    }
}

async function loadVetraPackages() {
    const commonPackage = await loadCommonPackage();
    const externalPackages = await loadExternalPackages();
    return [commonPackage, ...externalPackages];
}

async function getDid() {
    const crypto = await getConnectCrypto();
    return crypto.did();
}

async function initRenown(
    getDid: () => Promise<string>,
): Promise<IRenown | undefined> {
    try {
        const did = await getDid();
        if (!did) {
            return;
        }
        const { initRenownBrowser } = await import(
            '../services/renown/index.js'
        );
        const renownBrowser = initRenownBrowser(did);
        const renown: IRenown = {
            user: function (): Promise<User | undefined> {
                return Promise.resolve(renownBrowser.user);
            },
            login: function (did: string): Promise<User | undefined> {
                return renownBrowser.login(did);
            },
            logout() {
                return Promise.resolve(renownBrowser.logout());
            },
            on: {
                user(cb) {
                    return renownBrowser.on('user', cb);
                },
            },
        };
        return renown;
    } catch (err) {
        console.error(
            'Error initializing renown:',
            err instanceof Error ? err.message : 'Unknown error',
        );
        return undefined;
    }
}

export async function createReactor() {
    if (window.reactor) return;
    // add window event handlers for updates
    addPHEventHandlers();

    // initialize renown
    const renown = await initRenown(getDid);

    // initialize storage
    const storage = createBrowserStorage(connectConfig.routerBasename);

    // load vetra packages
    const vetraPackages = await loadVetraPackages();

    // get document models to set in the reactor
    const documentModelModules = vetraPackages
        .flatMap(pkg => pkg.modules.documentModelModules)
        .filter(module => module !== undefined);

    // create the reactor
    const reactor = createBrowserDocumentDriveServer(
        documentModelModules,
        storage,
    );

    // initialize the reactor
    await initReactor(reactor, renown);

    // create the processor manager
    const processorManager = new ProcessorManager(reactor.listeners, reactor);

    // get the drives from the reactor
    const drives = await getDrives(reactor);
    // get the documents from the reactor
    const documents = await getDocuments(reactor);

    // set the selected drive and node from the path
    const path = window.location.pathname;
    const driveSlug = extractDriveSlugFromPath(path);
    const nodeSlug = extractNodeSlugFromPath(path);

    // dispatch the events to set the values in the window object
    dispatchSetReactorEvent(reactor);
    dispatchSetRenownEvent(renown);
    dispatchSetProcessorManagerEvent(processorManager);
    dispatchSetDrivesEvent(drives);
    dispatchSetDocumentsEvent(documents);
    dispatchSetVetraPackagesEvent(vetraPackages);
    dispatchSetSelectedDriveIdEvent(driveSlug);
    dispatchSetSelectedNodeIdEvent(nodeSlug);

    // subscribe to reactor events
    reactor.on('syncStatus', (...args) => {
        logger.verbose('syncStatus', ...args);
        refreshReactorData(reactor).catch(logger.error);
    });
    reactor.on('strandUpdate', (...args) => {
        logger.verbose('strandUpdate', ...args);
        refreshReactorData(reactor).catch(logger.error);
    });
    reactor.on('defaultRemoteDrive', (...args) => {
        logger.verbose('defaultRemoteDrive', ...args);
        refreshReactorData(reactor).catch(logger.error);
    });
    reactor.on('clientStrandsError', (...args) => {
        logger.verbose('clientStrandsError', ...args);
        refreshReactorData(reactor).catch(logger.error);
    });
    reactor.on('driveAdded', (...args) => {
        logger.verbose('driveAdded', ...args);
        // register the drive with the processor manager
        processorManager.registerDrive(args[0].header.id).catch(logger.error);
        refreshReactorData(reactor).catch(logger.error);
    });
    reactor.on('driveDeleted', (...args) => {
        logger.verbose('driveDeleted', ...args);
        refreshReactorData(reactor).catch(logger.error);
    });
    reactor.on('documentModelModules', (...args) => {
        logger.verbose('documentModelModules', ...args);
        refreshReactorData(reactor).catch(logger.error);
    });
    reactor.on('documentOperationsAdded', (...args) => {
        logger.verbose('documentOperationsAdded', ...args);
        refreshReactorData(reactor).catch(logger.error);
    });
    reactor.on('driveOperationsAdded', (...args) => {
        console.log('driveOperationsAdded', ...args);
        logger.verbose('driveOperationsAdded', ...args);
        refreshReactorData(reactor).catch(logger.error);
    });
    reactor.on('operationsAdded', (...args) => {
        console.log('operationsAdded', ...args);
        logger.verbose('operationsAdded', ...args);
        refreshReactorData(reactor).catch(logger.error);
    });
}
