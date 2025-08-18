import connectConfig from '#connect-config';
import { BrowserKeyStorage } from '#services';
import { createBrowserDocumentDriveServer, createBrowserStorage } from '#utils';
import {
    addPHEventHandlers,
    dispatchSetAppConfigEvent,
    dispatchSetConnectCryptoEvent,
    dispatchSetDidEvent,
    dispatchSetDocumentsEvent,
    dispatchSetDrivesEvent,
    dispatchSetLoginStatusEvent,
    dispatchSetProcessorManagerEvent,
    dispatchSetReactorEvent,
    dispatchSetRenownEvent,
    dispatchSetSelectedDriveIdEvent,
    dispatchSetSelectedNodeIdEvent,
    dispatchSetUserEvent,
    dispatchSetVetraPackagesEvent,
    extractDriveSlugFromPath,
    extractNodeSlugFromPath,
    getDocuments,
    getDrives,
    login,
    refreshReactorData,
} from '@powerhousedao/reactor-browser';
import {
    ConnectCrypto,
    type IConnectCrypto,
} from '@powerhousedao/reactor-browser/crypto/index';
import { initRenown, type IRenown } from '@renown/sdk';
import { logger, type IDocumentDriveServer as Reactor } from 'document-drive';
import { ProcessorManager } from 'document-drive/processors/processor-manager';
import { generateId } from 'document-model';
import { loadCommonPackage } from './document-model.js';
import { loadExternalPackages } from './external-packages.js';

async function initReactor(
    reactor: Reactor,
    renown: IRenown | undefined,
    connectCrypto: IConnectCrypto | undefined,
) {
    await initJwtHandler(reactor, renown, connectCrypto);
    const errors = await reactor.initialize();
    const error = errors?.at(0);
    if (error) {
        throw error;
    }
}

export async function handleCreateFirstLocalDrive(
    reactor: Reactor | undefined,
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
    return document;
}

async function initJwtHandler(
    reactor: Reactor,
    renown: IRenown | undefined,
    connectCrypto: IConnectCrypto | undefined,
) {
    let user = renown?.user;
    if (user instanceof Function) {
        user = await user();
    }
    if (!connectCrypto || !user) {
        return;
    }

    reactor.setGenerateJwtHandler(async driveUrl => {
        return connectCrypto.getBearerToken?.(driveUrl, user.address) ?? '';
    });
}

async function loadVetraPackages() {
    const commonPackage = await loadCommonPackage();
    const externalPackages = await loadExternalPackages();
    return [commonPackage, ...externalPackages];
}

async function initConnectCrypto() {
    const connectCrypto = new ConnectCrypto(new BrowserKeyStorage());
    await connectCrypto.did();
    return connectCrypto;
}

export async function createReactor() {
    if (window.reactor) return;

    // add window event handlers for updates
    addPHEventHandlers();

    // initialize app config
    const appConfig = getAppConfig();

    // initialize connect crypto
    const connectCrypto = await initConnectCrypto();
    console.log('connectCrypto', connectCrypto);

    // initialize did
    const did = await connectCrypto.did();
    console.log('did', did);

    // initialize renown
    const renown = initRenown(did, connectConfig.routerBasename);
    console.log('renown', renown);

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
    await initReactor(reactor, renown, connectCrypto);

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

    // initialize user
    const didFromUrl = getDidFromUrl();
    await login(didFromUrl, reactor, renown, connectCrypto);
    // dispatch the events to set the values in the window object
    dispatchSetReactorEvent(reactor);
    dispatchSetConnectCryptoEvent(connectCrypto);
    dispatchSetDidEvent(did);
    dispatchSetRenownEvent(renown);
    dispatchSetAppConfigEvent(appConfig);
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

function getAppConfig() {
    const allowList = getAllowList();
    const analyticsDatabaseName = connectConfig.analytics.databaseName;
    const showSearchBar = connectConfig.content.showSearchBar;
    return {
        allowList,
        analyticsDatabaseName,
        showSearchBar,
    };
}

function getAllowList() {
    const arbitrumAllowList =
        import.meta.env.PH_CONNECT_ARBITRUM_ALLOW_LIST.split(',');
    const rwaAllowList = import.meta.env.PH_CONNECT_RWA_ALLOW_LIST.split(',');
    if (!arbitrumAllowList.length && !rwaAllowList.length) {
        return undefined;
    }
    return [...arbitrumAllowList, ...rwaAllowList];
}

function getDidFromUrl() {
    const searchParams = new URLSearchParams(window.location.search);
    const didComponent = searchParams.get('user');
    const did = didComponent ? decodeURIComponent(didComponent) : undefined;
    return did;
}
