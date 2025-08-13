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
    dispatchSetSelectedDriveIdEvent,
    dispatchSetSelectedNodeIdEvent,
    dispatchSetVetraPackagesEvent,
} from '@powerhousedao/state/internal/events';
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
    console.log('hasDrives', hasDrives, drives);
    if (hasDrives) return;

    const driveId = generateId();
    const driveSlug = `my-local-drive-${driveId}`;
    console.log({ driveId, driveSlug, drives });
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

export async function createReactor() {
    if (window.reactor) return;
    // add window event handlers for updates
    addPHEventHandlers();

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

    // assume that renown already exists on the window object
    // TODO: use event based solution for this too
    const renown = window.renown;

    // initialize the reactor
    await initReactor(reactor, renown);

    // create the processor manager
    const processorManager = new ProcessorManager(reactor.listeners, reactor);

    // get the drives, documents, and path
    const drives = await getDrives(reactor);
    const documents = await getDocuments(reactor);
    const path = window.location.pathname;
    const driveSlug = extractDriveSlugFromPath(path);
    const nodeSlug = extractNodeSlugFromPath(path);

    // dispatch the events to set the values in the window object
    dispatchSetReactorEvent(reactor);
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
