import {
  buildPHGlobalConfig,
  phGlobalConfig,
} from "@powerhousedao/connect/config";
import { toast } from "@powerhousedao/connect/services";
import {
  addDefaultDrivesForNewReactor,
  createBrowserReactor,
  getDefaultDrives,
} from "@powerhousedao/connect/utils";
import { createRemoteAttachmentService } from "@powerhousedao/reactor-attachments/client";
import {
  addPHEventHandlers,
  addRemoteDrive,
  DocumentCache,
  DocumentChangeType,
  extractDriveSlugFromPath,
  extractNodeSlugFromPath,
  getDrives,
  login,
  refreshReactorDataClient,
  RegistryClient,
  setAttachmentService,
  setDefaultPHGlobalConfig,
  setDocumentCache,
  setDrives,
  setFeatures,
  setPackageDiscoveryService,
  setPHToast,
  setReactorClient,
  setReactorClientModule,
  setRenown,
  setSelectedDrive,
  setSelectedNode,
  setVetraPackageManager,
  type BrowserReactorClientModule,
  type IDocumentModelLoader,
  type IPackageManager,
  type PHToastFn,
  type WorkerReactorClientModule,
} from "@powerhousedao/reactor-browser";
import {
  BrowserKeyStorage,
  RenownBuilder,
  RenownCryptoBuilder,
} from "@renown/sdk";
import {
  logger,
  type DocumentModelLib,
  type UpgradeManifest,
} from "document-model";
import { initFeatureFlags } from "../feature-flags.js";
import { NoRegistryDiscoveryService } from "../no-registry-discovery.js";
import { PackageDiscoveryService } from "../package-discovery.js";
import { BrowserPackageManager } from "../package-manager.js";
import { getRuntimeConfig } from "../runtime-config.js";
import { createWorkerReactorClientModule } from "../reactor-worker-client.js";
import { bumpWorkerGen } from "../reactor-worker-name.js";
import { isReactorWorkerEnabled } from "../utils/reactor-worker-flag.js";
import {
  REACTOR_INSTANCE_NAMESPACE,
  RELATIONAL_PGLITE_NAME,
} from "../utils/storage-namespace.js";
import { createProcessorHostModule } from "./processor-host-module.js";

/**
 * Subscribe to the `/__packages` SSE channel exposed by ph-clint's
 * static-mode `connect-server.js`. On each `packages-changed` event the
 * server sends the full live list; we diff against what the packageManager
 * already has loaded and call `addPackage`/`removePackage` to converge.
 *
 * Best-effort — silently no-ops when the SSE endpoint doesn't exist
 * (e.g. running under vite dev, or hosted somewhere without this protocol).
 */
function subscribeToPackagesChannel(packageManager: IPackageManager): void {
  if (typeof window === "undefined" || typeof EventSource === "undefined") {
    return;
  }
  let source: EventSource;
  try {
    source = new EventSource("/__packages");
  } catch (err) {
    console.debug("[Connect] /__packages subscribe failed:", err);
    return;
  }
  let firstEvent = true;
  source.addEventListener("packages-changed", (event) => {
    try {
      const payload = JSON.parse((event as MessageEvent<string>).data) as {
        packages?: unknown;
      };
      if (!Array.isArray(payload.packages)) return;
      const next = payload.packages.filter(
        (p): p is string => typeof p === "string",
      );
      // Split each incoming spec into (bareName, version). The server may
      // send either bare names ("@scope/pkg") or version-qualified specs
      // ("@scope/pkg@1.2.3"). parseBareName-style logic: for scoped specs
      // the first `@` belongs to the scope, so version starts after the
      // last `@` only when that `@` is past index 0.
      const parseBare = (
        spec: string,
      ): { bareName: string; version?: string } => {
        const at = spec.startsWith("@")
          ? spec.lastIndexOf("@")
          : spec.indexOf("@");
        if (at > 0) {
          return { bareName: spec.slice(0, at), version: spec.slice(at + 1) };
        }
        return { bareName: spec };
      };

      // Diff against the registry-tracked subset only. Bundled "common"
      // packages and the project's local package never appear in the
      // server's list and removing them on every event would wipe the
      // drive editors and break the AddDrive modal.
      const currentByName = new Map(
        packageManager
          .getRegistryPackages()
          .map(({ name, version }) => [name, version]),
      );
      const nextByName = new Map<string, string | undefined>();
      for (const spec of next) {
        const { bareName, version } = parseBare(spec);
        nextByName.set(bareName, version);
      }

      const isFirst = firstEvent;
      firstEvent = false;

      for (const name of currentByName.keys()) {
        if (!nextByName.has(name)) {
          packageManager.removePackage(name);
          if (!isFirst) {
            toast(`Removed package ${name}`, { type: "connect-deleted" });
          }
        }
      }
      for (const spec of next) {
        const { bareName, version } = parseBare(spec);
        const currentVersion = currentByName.get(bareName);
        const isKnown = currentByName.has(bareName);
        // Skip when the package is already present at the same version (or
        // when no version info is available on either side to compare).
        if (
          isKnown &&
          (!version || !currentVersion || version === currentVersion)
        ) {
          continue;
        }
        const isUpdate = isKnown;
        Promise.resolve(packageManager.addPackage(spec)).then(
          (result) => {
            if (result.type === "error") {
              console.error(
                `[Connect] /__packages addPackage(${spec}) failed:`,
                result.error,
              );
              return;
            }
            if (isFirst) return;
            const name = result.package.manifest.name;
            toast(
              isUpdate
                ? `Updated package ${name}`
                : `Installed package ${name}`,
              { type: "connect-success" },
            );
          },
          (err: unknown) => {
            console.error(
              `[Connect] /__packages addPackage(${spec}) threw:`,
              err,
            );
          },
        );
      }
    } catch (err) {
      console.error("[Connect] /__packages event parse failed:", err);
    }
  });
  source.addEventListener("error", () => {
    // EventSource auto-reconnects; nothing to do.
  });
}

export async function clearReactorStorage() {
  const module = window.ph?.reactorClientModule;
  if (module?.kind === "browser") {
    await module.reactorModule?.pg?.close();
  }

  // Dropping tables inside an existing PGlite instance is unreliable with
  // `relaxedDurability: true` followed by an immediate page reload — pending
  // IDB writes can be lost. Deleting the underlying database outright sidesteps
  // flush-timing; the next startup re-creates and re-migrates from scratch.
  const dbs = await indexedDB.databases();
  const targets = dbs
    .map((d) => d.name)
    .filter(
      (n): n is string =>
        !!n && !n.startsWith("ph-pglite-backup::") && /pglite|reactor/i.test(n),
    );

  await Promise.all(
    targets.map(
      (name) =>
        new Promise<void>((resolve) => {
          const req = indexedDB.deleteDatabase(name);
          req.onsuccess = req.onerror = req.onblocked = () => resolve();
        }),
    ),
  );
}

export async function createReactor(localPackage?: DocumentModelLib) {
  if (!window.ph) {
    window.ph = {};
  }
  if (window.ph.loading) return;

  window.ph.loading = true;

  // add window event handlers for updates
  addPHEventHandlers();

  // register toast function for use in editor components
  setPHToast(toast as PHToastFn);

  // initialize feature flags
  const features = await initFeatureFlags();

  logger.info(
    "Features: @features",
    JSON.stringify(Object.fromEntries(features), null, 2),
  );

  // initialize renown crypto
  const keyPairStorage = await BrowserKeyStorage.create();
  const renownCrypto = await new RenownCryptoBuilder()
    .withKeyPairStorage(keyPairStorage)
    .build();

  // initialize Renown
  const renown = await new RenownBuilder("connect", {
    basename: phGlobalConfig.routerBasename,
    baseUrl: phGlobalConfig.renownUrl,
  })
    .withCrypto(renownCrypto)
    .build();

  // Read the runtime config from cache. loadComponent() awaited
  // loadRuntimeConfig() before calling createReactor, so the cache is warm;
  // using the sync getter matches the convention used by connect.config.ts,
  // useRegistryPackages, and pages/content.tsx — and throws loudly if a
  // future caller violates the boot ordering.
  const runtimeConfig = getRuntimeConfig();

  // initialize package manager
  const packageManager = new BrowserPackageManager(
    phGlobalConfig.routerBasename ?? "",
    runtimeConfig.packageRegistryUrl ?? null,
  );
  setVetraPackageManager(packageManager);
  await packageManager.init(localPackage, runtimeConfig.localPackage?.version);
  // Register any packages marked as provider: "local" in powerhouse.config.json
  // that the vite plugin bundled into this build. The virtual module is only
  // emitted when `phBundledPackagesPlugin` is registered (ph-cli's Connect
  // flow); running `vite dev` against apps/connect's own config has no
  // bundled packages, so a resolution failure here is expected. The
  // indirection + @vite-ignore also keeps Vite's dep scanner from treating
  // the specifier as a real npm package to pre-bundle.
  try {
    const bundledPackagesModule = "ph-bundled-packages-virtual";
    const { default: registerBundledPackages } = (await import(
      /* @vite-ignore */ bundledPackagesModule
    )) as { default: (pm: IPackageManager) => void };
    registerBundledPackages(packageManager);
  } catch {
    // no bundled packages in this build
  }
  const remotePackages = runtimeConfig.packages
    .filter((p) => p.provider !== "local")
    .map((p) => (p.version ? `${p.packageName}@${p.version}` : p.packageName));
  const packagesResult = await packageManager.addPackages(remotePackages);
  packagesResult.map((r) => {
    if (r.type === "error") console.error(r.error);
  });

  // Opt-in: subscribe to the static-mode `/__packages` SSE channel so live
  // publishes (e.g. ph-clint's publish-reload trigger pushing a new list) flow
  // into the running tab without a page reload. Enabled via
  // `connect.packages.liveReload`; the channel only exists in static hosting
  // that speaks this protocol.
  if (runtimeConfig.connect?.packages?.liveReload) {
    subscribeToPackagesChannel(packageManager);
  }

  // get document models to set in the reactor (all versions)
  const documentModelModules = packageManager.packages
    .flatMap((pkg) => pkg.documentModels)
    .filter(
      (module, index, modules) =>
        // deduplicate by documentType and version
        modules.findIndex(
          (m) =>
            m.documentModel.global.id === module.documentModel.global.id &&
            m.version === module.version,
        ) === index,
    );

  // get upgrade manifests from packages
  const upgradeManifests = packageManager.packages
    .flatMap((pkg) => pkg.upgradeManifests)
    .filter(
      (manifest, index, manifests) =>
        // deduplicate by documentType and version
        manifest !== undefined &&
        manifests.findIndex(
          (m) => m && m.documentType === manifest.documentType,
        ) === index,
    ) as UpgradeManifest<readonly number[]>[];

  // initialize package discovery service for auto-installing unknown document types
  const discoveryService =
    packageManager.cdnUrl !== null
      ? new PackageDiscoveryService(
          packageManager,
          new RegistryClient(packageManager.cdnUrl),
          {
            mode: "immediate",
            storageKey: phGlobalConfig.routerBasename ?? "",
          },
        )
      : new NoRegistryDiscoveryService(packageManager);

  setPackageDiscoveryService(discoveryService);

  // create reactor v2 with all versions and upgrade manifests
  let reactorClientModule:
    | BrowserReactorClientModule
    | WorkerReactorClientModule;
  if (isReactorWorkerEnabled()) {
    const packageSpecs = packageManager
      .getRegistryPackages()
      .map((p) => (p.version ? `${p.name}@${p.version}` : p.name));
    // Silent tab loader (no install prompt; the worker already loaded the model).
    const registryClient = new RegistryClient(packageManager.cdnUrl ?? "");
    const documentModelLoader: IDocumentModelLoader = {
      async load(documentType) {
        const names = packageManager.cdnUrl
          ? await registryClient.getPackagesByDocumentType(documentType)
          : [];
        for (const name of names) {
          const result = await packageManager.addPackage(name);
          if (result.type === "error") {
            throw new Error(
              `Failed to install package "${name}" for document model: ${documentType}`,
              { cause: result.error },
            );
          }
        }
        const module = packageManager.packages
          .flatMap((p) => p.documentModels)
          .find((m) => m.documentModel.global.id === documentType);
        if (!module) {
          throw new Error(
            names.length > 0
              ? `Installed [${names.join(", ")}] but document model not available: ${documentType}`
              : `No package found for document model: ${documentType} (cdnUrl: ${packageManager.cdnUrl ?? "none"})`,
          );
        }
        return module;
      },
    };
    const workerClient = createWorkerReactorClientModule({
      namespace: REACTOR_INSTANCE_NAMESPACE,
      relationalNamespace: RELATIONAL_PGLITE_NAME,
      cdnUrl: packageManager.cdnUrl ?? "",
      packageSpecs,
      documentModelModules,
      upgradeManifests,
      documentModelLoader,
      renown,
      onReload: (reason, workerGen) => {
        logger.warn("Reactor worker requested reload: @reason", reason);
        if (workerGen) {
          bumpWorkerGen(REACTOR_INSTANCE_NAMESPACE, workerGen);
        }
        window.location.reload();
      },
    });
    reactorClientModule = workerClient.reactorClientModule;
    // Block boot until the sync manager seeds remotes from the worker, so
    // list()/connection state are warm before consumers first read them.
    await workerClient.syncManagerProxy.startup();
  } else {
    reactorClientModule = await createBrowserReactor(
      documentModelModules,
      upgradeManifests,
      renown,
      discoveryService,
    );
  }

  // get the drives from the reactor
  const drives = await getDrives(reactorClientModule.client);

  // initialize user from URL parameter
  const didFromUrl = getDidFromUrl();
  await login(didFromUrl, renown);

  const documentCache = new DocumentCache(reactorClientModule.client);

  // dispatch the events to set the values in the window object
  const basePath = phGlobalConfig.basePath ?? "/";
  const routerBasename = phGlobalConfig.routerBasename ?? "/";
  const mergedGlobalConfig = buildPHGlobalConfig(
    basePath,
    routerBasename,
    runtimeConfig.connect ?? {},
  );
  setDefaultPHGlobalConfig(mergedGlobalConfig);

  // Slug extraction needs window.ph.basePath, published by
  // setDefaultPHGlobalConfig above.
  const path = window.location.pathname;
  const driveSlug = extractDriveSlugFromPath(path);
  const nodeSlug = extractNodeSlugFromPath(path);
  setReactorClientModule(reactorClientModule);
  setReactorClient(reactorClientModule.client);

  const _defaultDrivesUrl = phGlobalConfig.defaultDrivesUrl;
  if (_defaultDrivesUrl) {
    let switchboardOrigin: string | undefined;
    try {
      switchboardOrigin = new URL(_defaultDrivesUrl).origin;
    } catch {
      // malformed URL — skip attachment service construction
    }
    if (switchboardOrigin) {
      const attachmentJwtHandler = async (_url: string) => {
        if (!renown.user) return undefined;
        // aud omitted: server verifies without an audience, so aud-bearing
        // tokens are rejected. Re-enable once both sides support it.
        return renown.getBearerToken({ expiresIn: 10 });
      };
      const attachmentService = createRemoteAttachmentService({
        remoteUrl: switchboardOrigin,
        jwtHandler: attachmentJwtHandler,
      });
      setAttachmentService(attachmentService);
    }
  }

  setDocumentCache(documentCache);
  setRenown(renown);
  setDrives(drives);
  setFeatures(features);

  // Add default drives and any URL-supplied remote drive in the background so
  // the app renders immediately. setSelectedDrive defers selection until the
  // drive matching the URL slug syncs in (see deferDriveSelection), so we only
  // ever wait for the selected drive, never for unrelated default drives.
  const defaultDrivesConfig = getDefaultDrives(runtimeConfig);
  if (defaultDrivesConfig.length > 0) {
    void addDefaultDrivesForNewReactor(defaultDrivesConfig).catch((error) =>
      console.error("Failed to add default drives:", error),
    );
  }

  const remoteUrl = getDriveUrl();
  if (remoteUrl) {
    void addRemoteDrive(remoteUrl, undefined).catch((error) =>
      console.error(`Failed to add remote drive from ${remoteUrl}:`, error),
    );
  }

  setSelectedDrive(driveSlug);
  setSelectedNode(nodeSlug);

  // Subscribe via ReactorClient interface
  const reactorClient = reactorClientModule.client;
  reactorClient.subscribe({ type: "powerhouse/document-drive" }, (event) => {
    logger.verbose("ReactorClient subscription event: @event", event);
    refreshReactorDataClient(reactorClientModule.client).catch((e) =>
      logger.error("@error", e),
    );
  });

  // Redirect when a currently-viewed document or drive is deleted remotely
  reactorClient.subscribe({}, (event) => {
    if (event.type !== DocumentChangeType.Deleted) return;
    const deletedId = event.context?.childId;
    if (!deletedId) return;

    const selectedDriveId = window.ph?.selectedDriveId;
    const selectedNodeId = window.ph?.selectedNodeId;

    if (selectedDriveId && deletedId === selectedDriveId) {
      setSelectedDrive(undefined);
      toast("The drive you were viewing has been deleted");
      return;
    }

    if (selectedNodeId && deletedId === selectedNodeId) {
      setSelectedNode(undefined);
      toast("The document you were editing has been deleted");
    }
  });

  // Refresh from ReactorClient to pick up any synced drives
  await refreshReactorDataClient(reactorClientModule.client);

  // Setup processor factories for packages that have them
  const packagesWithProcessorFactories = packageManager.packages.filter(
    (pkg) => pkg.processorFactory !== undefined,
  );

  // processorManager lives in the worker on the cutover path and is not yet
  // bridged, so surface the gap loudly rather than dropping factories silently.
  const reactorModule =
    reactorClientModule.kind === "browser"
      ? reactorClientModule.reactorModule
      : undefined;
  if (packagesWithProcessorFactories.length > 0 && !reactorModule) {
    for (const pkg of packagesWithProcessorFactories) {
      logger.warn(
        "Skipping processor factory @name: processors are not supported on the worker reactor path yet",
        pkg.manifest.name,
      );
    }
  } else if (packagesWithProcessorFactories.length > 0 && reactorModule) {
    const readModels = reactorModule.readModelCoordinator.readModels;
    const processorHostModule = await createProcessorHostModule(
      reactorClientModule.client,
      readModels,
      window.ph?.attachmentService,
    );
    if (processorHostModule !== undefined) {
      await Promise.all(
        packagesWithProcessorFactories.map(async (pkg) => {
          const { manifest, processorFactory } = pkg;
          const name = manifest.name;
          const id = manifest.name;
          const version = packageManager.getPackageVersion(name);
          const label = version ? `${name}@${version}` : name;
          logger.info("Loading processor factory: @label", label);
          try {
            const factory = await processorFactory?.(processorHostModule);
            if (!factory) return;
            await reactorModule.processorManager.registerFactory(id, factory);
          } catch (error) {
            logger.error(`Error registering processor: @label`, label);
            logger.error("@error", error);
          }
        }),
      );
    }
  }

  window.ph.loading = false;
}

function getDidFromUrl() {
  const searchParams = new URLSearchParams(window.location.search);
  const didComponent = searchParams.get("user");
  const did = didComponent ? decodeURIComponent(didComponent) : undefined;
  return did;
}

function getDriveUrl() {
  const searchParams = new URLSearchParams(window.location.search);
  const driveUrl = searchParams.get("driveUrl");
  const url = driveUrl ? decodeURIComponent(driveUrl) : undefined;
  return url;
}
