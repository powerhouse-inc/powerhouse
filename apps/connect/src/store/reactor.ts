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
  DRIVE_DOCUMENT_TYPES,
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
  type IPackageManager,
  type PHToastFn,
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
import { createProcessorHostModule } from "./processor-host-module.js";

/**
 * Subscribe to ph-clint's `/__packages` SSE channel; each `packages-changed`
 * event sends the full live list, which we diff to add/remove packages.
 * Best-effort: no-ops when the endpoint is absent (e.g. vite dev).
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
      // Split a spec into (bareName, version). For scoped specs the leading
      // `@` is the scope, so the version `@` only counts when past index 0.
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

      // Diff against registry packages only; bundled/local packages aren't in
      // the server list and removing them would break the drive editors.
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
    // EventSource auto-reconnects.
  });
}

export async function clearReactorStorage() {
  await window.ph?.reactorClientModule?.pg?.close();

  // Dropping tables in PGlite with relaxedDurability can lose pending IDB
  // writes on reload; delete the whole DB so startup re-migrates from scratch.
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

  addPHEventHandlers();

  setPHToast(toast as PHToastFn);

  const features = await initFeatureFlags();

  logger.info(
    "Features: @features",
    JSON.stringify(Object.fromEntries(features), null, 2),
  );

  const keyPairStorage = await BrowserKeyStorage.create();
  const renownCrypto = await new RenownCryptoBuilder()
    .withKeyPairStorage(keyPairStorage)
    .build();

  // Renown namespace is a boot-time constant, so read it from runtime config
  // rather than the PHGlobalConfig machinery; baseUrl stays in phGlobalConfig.
  const renown = await new RenownBuilder("connect", {
    basename:
      getRuntimeConfig().connect.renown?.namespace ??
      phGlobalConfig.routerBasename,
    baseUrl: phGlobalConfig.renownUrl,
  })
    .withCrypto(renownCrypto)
    .build();

  // Sync getter is safe: loadComponent() warmed the cache before createReactor,
  // and it throws loudly if a future caller violates that boot ordering.
  const runtimeConfig = getRuntimeConfig();

  const packageManager = new BrowserPackageManager(
    phGlobalConfig.routerBasename ?? "",
    runtimeConfig.packageRegistryUrl ?? null,
  );
  setVetraPackageManager(packageManager);
  await packageManager.init(localPackage, runtimeConfig.localPackage?.version);
  // Register provider:"local" packages the vite plugin bundled in. The virtual
  // module only exists under phBundledPackagesPlugin (ph-cli), so a resolution
  // failure under plain vite dev is expected; the indirection + @vite-ignore
  // also stops Vite's dep scanner from pre-bundling the specifier.
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

  // Opt-in (connect.packages.liveReload): pick up live publishes without a
  // page reload via the static-mode `/__packages` SSE channel.
  if (runtimeConfig.connect?.packages?.liveReload) {
    subscribeToPackagesChannel(packageManager);
  }

  const documentModelModules = packageManager.packages
    .flatMap((pkg) => pkg.documentModels)
    .filter(
      (module, index, modules) =>
        // dedupe by documentType and version
        modules.findIndex(
          (m) =>
            m.documentModel.global.id === module.documentModel.global.id &&
            m.version === module.version,
        ) === index,
    );

  const upgradeManifests = packageManager.packages
    .flatMap((pkg) => pkg.upgradeManifests)
    .filter(
      (manifest, index, manifests) =>
        // dedupe by documentType
        manifest !== undefined &&
        manifests.findIndex(
          (m) => m && m.documentType === manifest.documentType,
        ) === index,
    ) as UpgradeManifest<readonly number[]>[];

  // auto-installs packages for unknown document types
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

  const reactorClientModule = await createBrowserReactor(
    documentModelModules,
    upgradeManifests,
    renown,
    discoveryService,
  );

  const drives = await getDrives(reactorClientModule.client);

  const didFromUrl = getDidFromUrl();
  await login(didFromUrl, renown);

  const documentCache = new DocumentCache(reactorClientModule.client);

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
        // aud omitted: server rejects aud-bearing tokens. Re-enable once both sides support it.
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

  // Add default/remote drives in the background so the app renders immediately;
  // setSelectedDrive defers selection until the URL-matched drive syncs in.
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

  // Refresh the drive list on any drive-type change so async-added
  // default/remote drives surface on first load without a manual reload.
  const reactorClient = reactorClientModule.client;
  for (const driveType of DRIVE_DOCUMENT_TYPES) {
    reactorClient.subscribe({ type: driveType }, (event) => {
      logger.verbose("ReactorClient subscription event: @event", event);
      refreshReactorDataClient(reactorClientModule.client).catch((e) =>
        logger.error("@error", e),
      );
    });
  }

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

  await refreshReactorDataClient(reactorClientModule.client);

  const packagesWithProcessorFactories = packageManager.packages.filter(
    (pkg) => pkg.processorFactory !== undefined,
  );

  if (packagesWithProcessorFactories.length > 0) {
    const readModels =
      reactorClientModule.reactorModule?.readModelCoordinator?.readModels ?? [];
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
            await reactorClientModule.reactorModule?.processorManager.registerFactory(
              id,
              factory,
            );
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
