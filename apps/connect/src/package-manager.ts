import * as common from "@powerhousedao/powerhouse-vetra-packages";
import commonPkg from "@powerhousedao/powerhouse-vetra-packages/package.json" with { type: "json" };
import type {
  IPackagesListener,
  PackageManagerInstallResult,
} from "@powerhousedao/reactor-browser";
import {
  BrowserLocalStorage,
  type IPackageListerUnsubscribe,
  type IPackageManager,
} from "@powerhousedao/reactor-browser";
import {
  mergePwaConfig,
  type PHConnectPwa,
  type PwaContribution,
  withInferredCategory,
} from "@powerhousedao/shared/connect";
import {
  type DocumentModelLib,
  type DocumentModelModule,
  PwaConfigSchema,
} from "@powerhousedao/shared/document-model";
import { toCdnUrl } from "@powerhousedao/shared/registry/urls";
import {
  resolveFragmentAssetUrls,
  writeMergedPwaFragment,
} from "./utils/pwa-idb.js";
import { refreshPwaManifestLink } from "./utils/pwa-manifest-link.js";
import * as vetra from "@powerhousedao/vetra";
import vetraPkg from "@powerhousedao/vetra/package.json" with { type: "json" };

type PackageMeta = {
  name: string;
  importUrl: string | null;
  stylesheetUrl: string | null;
  version?: string;
  /**
   * Full spec the user asked for (e.g. `@scope/pkg@2.0.0-beta.2`). Kept so a
   * reload re-installs exactly the tag/version originally picked rather than
   * sliding to `latest`. Absent for legacy entries and local packages.
   */
  spec?: string;
};

/**
 * Strip any `@tag` / `@version` suffix from a package spec, returning the bare
 * package name. Mirrors `parsePackageSpec` on the UI side.
 */
function parseBareName(spec: string): string {
  const trimmed = spec.trim();
  const at = trimmed.startsWith("@")
    ? trimmed.lastIndexOf("@")
    : trimmed.indexOf("@");
  return at > 0 ? trimmed.slice(0, at) : trimmed;
}

type PackageWithMeta = PackageMeta & {
  loadedPackage: DocumentModelLib<any>;
  spec?: string;
};

async function fetchPackageJsonVersion(
  baseUrl: string,
): Promise<string | undefined> {
  try {
    const res = await fetch(baseUrl);
    if (!res.ok) return undefined;
    const pkg = (await res.json()) as { version?: unknown };
    return typeof pkg.version === "string" ? pkg.version : undefined;
  } catch {
    return undefined;
  }
}

const LOCAL_PACKAGE_NAME = "Local" as const;

export class BrowserPackageManager implements IPackageManager {
  registryUrl: string | null;
  #storage: BrowserLocalStorage<PackageMeta>;
  #packages: Map<string, DocumentModelLib<any>> = new Map();
  #subscribers = new Set<IPackagesListener>();
  #packagesMemo: DocumentModelLib<any>[] = [];
  #stylesheets: Map<string, HTMLStyleElement> = new Map();
  #localPackage: DocumentModelLib<any> | undefined;

  #cdnUrl: string | null;
  #localPackageVersion: string | undefined;
  #localPackageNames: Set<string> = new Set([LOCAL_PACKAGE_NAME]);
  #pwaSyncTimer: ReturnType<typeof setTimeout> | undefined;
  /** Serialized last-mirrored PWA fragment; lets a sync skip the IndexedDB
   * write + manifest re-attach when nothing PWA-relevant changed. */
  #lastSyncedFragmentJson: string | undefined;

  constructor(namespace: string, registryUrl: string | null) {
    this.#storage = new BrowserLocalStorage<PackageMeta>(
      namespace + ":PH_PACKAGES",
    );
    this.registryUrl = registryUrl;
    this.#cdnUrl = registryUrl !== null ? toCdnUrl(registryUrl) : null;
  }

  async init(
    localPackage?: DocumentModelLib<any>,
    localPackageVersion?: string,
  ) {
    this.addLocalPackage(common.manifest.name, common, commonPkg.version);
    this.addLocalPackage(vetra.manifest.name, vetra, vetraPkg.version);
    if (localPackage) {
      this.updateLocalPackage(localPackage, localPackageVersion);
    }
    for (const packageName of this.#storage.keys()) {
      // Re-hydrate with the originally-requested spec so a tag/version pick
      // sticks across reloads. Fall back to the bare key for legacy entries
      // (pre-spec) and for entries that never had a tag.
      const existingMeta = this.#storage.get(packageName);
      const specForReload = existingMeta?.spec ?? packageName;
      console.debug(
        `[Connect][PackageManager] Rehydrating "${packageName}" via spec "${specForReload}"`,
      );
      const result = await this.addPackage(specForReload);
      // Previously-installed package that no longer resolves (version
      // withdrawn from npm, registry moved, etc.) would otherwise
      // 404-toast on every boot forever. Drop it from persistent storage
      // so the failure is one-shot instead of sticky.
      if (result.type === "error") {
        this.#storage.delete(packageName);
      }
    }
  }

  addLocalPackage(
    name: string,
    loadedPackage: DocumentModelLib<any>,
    version?: string,
  ) {
    this.#localPackageNames.add(name);
    this.#registerPackage({
      name,
      importUrl: null,
      stylesheetUrl: null,
      loadedPackage,
      version,
    });
  }

  updateLocalPackage(pkg: DocumentModelLib<any>, version?: string) {
    console.debug("Updating local package:", pkg);
    this.#localPackage = pkg;
    this.#registerPackage({
      name: LOCAL_PACKAGE_NAME,
      stylesheetUrl: null,
      importUrl: null,
      loadedPackage: pkg,
    });
    if (version) {
      this.#localPackageVersion = version;
      this.#notifyPackagesChanged();
      return;
    }
    fetchPackageJsonVersion("/package.json")
      .then((fetchedVersion) => {
        this.#localPackageVersion = fetchedVersion;
        if (fetchedVersion) this.#notifyPackagesChanged();
      })
      .catch(() => {});
  }

  get packages() {
    return this.#packagesMemo;
  }

  get cdnUrl(): string | null {
    return this.#cdnUrl;
  }

  getPackageSource(packageName: string) {
    // check vs packages registered as local (Common, Vetra, bundled packages...)
    if (this.#localPackageNames.has(packageName)) {
      return "common";
    }
    // check if the package has the same name as the local project
    if (packageName === this.#localPackage?.manifest.name) return "project";
    const packageMeta = this.#storage.get(packageName);
    // if meta does not exist the package is not installed
    if (!packageMeta) return null;
    // if imported from node_modules then the package is installed locally
    if (packageMeta.importUrl === `/node_modules/${packageName}`)
      return "local-install";
    // all other import urls point to a registry
    return "registry-install";
  }

  /**
   * Return the registry-installed packages keyed by their storage name (which
   * is the registry spec, e.g. "@powerhousedao/clint-common"), with the
   * installed version when known. Excludes bundled (common) packages, the
   * local project package, and packages resolved out of `/node_modules/`.
   */
  getRegistryPackages(): { name: string; version: string | undefined }[] {
    const out: { name: string; version: string | undefined }[] = [];
    for (const [name, meta] of this.#storage) {
      if (this.#localPackageNames.has(name)) continue;
      if (name === LOCAL_PACKAGE_NAME) continue;
      if (meta.importUrl === `/node_modules/${name}`) continue;
      out.push({ name, version: meta.version });
    }
    return out;
  }

  getPackageVersion(packageName: string): string | undefined {
    if (packageName === this.#localPackage?.manifest.name) {
      return this.#localPackageVersion;
    }
    return this.#storage.get(packageName)?.version;
  }

  async addPackage(packageSpec: string): Promise<PackageManagerInstallResult> {
    // `packageSpec` may include a `@tag` / `@version` suffix (e.g. user picked
    // a specific version in the package manager UI, or re-hydrated on reload
    // from the persisted spec). We always register/look up by the bare name so
    // status tracking, version lookups, and uninstall all go through a single
    // canonical key. The spec itself is kept on the meta so reloads re-fetch
    // the same tag.
    const bareName = parseBareName(packageSpec);
    const hasTagOrVersion = bareName !== packageSpec;
    console.debug(
      `[Connect][PackageManager] addPackage spec="${packageSpec}" bareName="${bareName}"`,
    );

    const existingPackage = this.#packages.get(bareName);
    if (existingPackage) {
      const requestedVersion = hasTagOrVersion
        ? packageSpec.slice(bareName.length + 1)
        : undefined;
      const currentVersion = this.#storage.get(bareName)?.version;
      const isLocal = this.#localPackageNames.has(bareName);
      const sameVersion =
        !requestedVersion ||
        !currentVersion ||
        requestedVersion === currentVersion;
      if (isLocal || sameVersion) {
        console.debug(
          `[Connect][PackageManager] "${bareName}" already loaded; skipping re-fetch`,
        );
        return {
          type: "success",
          package: existingPackage,
        };
      }
      console.debug(
        `[Connect][PackageManager] "${bareName}" version bump ${currentVersion} → ${requestedVersion}; refetching`,
      );
    }
    try {
      const packageWithMeta = await this.#loadPackage(packageSpec);
      // `#loadPackage*` set `name` to whatever spec it built the URL from.
      // Canonicalize to the bare name for the map/storage keys, and stash the
      // original spec separately so reloads re-use it.
      packageWithMeta.name = bareName;
      if (hasTagOrVersion) {
        packageWithMeta.spec = packageSpec;
      }
      // Swap stylesheets only once the new package is in hand. If `#loadPackage`
      // throws above, the old stylesheet stays mounted and the UI keeps
      // rendering the previous version instead of unstyled markup.
      if (existingPackage) {
        this.#unmountStylesheet(bareName);
      }
      this.#registerPackage(packageWithMeta);

      return {
        type: "success",
        package: packageWithMeta.loadedPackage,
      };
    } catch (error) {
      const normalized =
        error instanceof Error ? error : new Error(String(error));
      console.error(
        `[Connect][PackageManager] Failed to install package "${packageSpec}": ${normalized.message}`,
        normalized,
      );
      return {
        type: "error",
        error: normalized,
      };
    }
  }

  async addPackages(packageNames: string[]) {
    const results: PackageManagerInstallResult[] = [];
    for (const packageName of packageNames) {
      const result = await this.addPackage(packageName);
      results.push(result);
    }
    return results;
  }

  removePackage(name: string) {
    this.#packages.delete(name);
    this.#storage.delete(name);
    this.#unmountStylesheet(name);
    this.#notifyPackagesChanged();
  }

  subscribe(handler: IPackagesListener): IPackageListerUnsubscribe {
    this.#subscribers.add(handler);
    return () => {
      this.#subscribers.delete(handler);
    };
  }

  load(documentType: string): Promise<DocumentModelModule<any>> {
    const documentModelModule = Array.from(
      this.#packages.values().flatMap((p) => p.documentModels),
    ).find((m) => m.documentModel.global.id === documentType);

    if (documentModelModule) return Promise.resolve(documentModelModule);
    return Promise.reject(new Error("Model not available"));
  }

  async #loadPackageFromNodeModules(name: string): Promise<PackageWithMeta> {
    const importUrl = `/node_modules/${name}/browser/index.js`;
    const stylesheetUrl = `/node_modules/${name}/style.css`;

    const packageWithMeta = await this.#importPackage({
      name,
      importUrl,
      stylesheetUrl,
    });
    packageWithMeta.version = await fetchPackageJsonVersion(
      `/node_modules/${name}/package.json`,
    );

    return packageWithMeta;
  }

  async #loadPackageFromRegistry(name: string): Promise<PackageWithMeta> {
    const importUrl = `${this.#cdnUrl}/${name}/browser/index.js`;
    const stylesheetUrl = `${this.#cdnUrl}/${name}/style.css`;
    const packageWithMeta = await this.#importPackage({
      name,
      importUrl,
      stylesheetUrl,
    });
    packageWithMeta.version = await fetchPackageJsonVersion(
      `${this.#cdnUrl}/${name}/package.json`,
    );

    return packageWithMeta;
  }

  async #importPackage(packageMeta: PackageMeta): Promise<PackageWithMeta> {
    const { name, importUrl, stylesheetUrl } = packageMeta;
    if (!importUrl) {
      throw new Error(`Import url not defined for package "${name}".`);
    }

    const loadedPackage = (await import(
      /* @vite-ignore */ importUrl
    )) as DocumentModelLib<any>;

    return {
      name,
      loadedPackage,
      importUrl,
      stylesheetUrl,
    };
  }

  async #loadPackage(packageName: string): Promise<PackageWithMeta> {
    if (this.#localPackageNames.has(packageName)) {
      throw new Error(
        `Package "${packageName}" is a local package and cannot be loaded dynamically.`,
      );
    }

    // only attemp to load from node_modules in dev mode
    if (!import.meta.env.PROD) {
      try {
        const packageWithMeta =
          await this.#loadPackageFromNodeModules(packageName);
        return packageWithMeta;
      } catch (error) {
        console.warn(
          `Failed to load package "${packageName}" from node_modules:`,
          error,
        );
      }
    }

    if (!this.registryUrl) {
      throw new Error("Registry url not defined.");
    }

    return await this.#loadPackageFromRegistry(packageName);
  }

  #registerPackage(packageWithMeta: PackageWithMeta) {
    const { name, loadedPackage, importUrl, stylesheetUrl, version, spec } =
      packageWithMeta;

    if (stylesheetUrl !== null) {
      this.#mountStylesheet(name, stylesheetUrl);
    }
    this.#packages.set(name, loadedPackage);
    this.#storage.set(name, {
      name,
      importUrl,
      stylesheetUrl,
      version,
      ...(spec ? { spec } : {}),
    });
    console.debug(
      `[Connect][PackageManager] Registered "${name}" (version=${version ?? "?"}, spec=${spec ?? "—"})`,
    );

    this.#notifyPackagesChanged();
  }

  #mountStylesheet(name: string, href: string) {
    const existing = this.#stylesheets.get(name);
    if (existing) return existing;

    const style = document.createElement("style");
    style.textContent = `@import url("${href}") layer(external-packages);`;
    document.head.appendChild(style);

    this.#stylesheets.set(name, style);
  }

  #unmountStylesheet(name: string): void {
    const style = this.#stylesheets.get(name);
    if (!style) return;

    style.remove();
    this.#stylesheets.delete(name);
  }

  #notifyPackagesChanged() {
    this.#packagesMemo = Array.from(this.#packages.values());
    const packages = this.packages;
    this.#subscribers.forEach((handler) => {
      handler({ packages });
    });
    this.#schedulePwaSync();
  }

  /**
   * Debounced mirror of every loaded package's PWA fragment into IndexedDB, so
   * the service worker can serve a web-app manifest that reflects packages
   * installed AT RUNTIME (a SW can't read localStorage, where the package list
   * lives). Debounced because `init()` rehydrates many packages in a burst;
   * coalescing collapses that into a single write.
   */
  #schedulePwaSync() {
    if (typeof indexedDB === "undefined") return;
    clearTimeout(this.#pwaSyncTimer);
    this.#pwaSyncTimer = setTimeout(() => {
      void this.#syncPwaFragments();
    }, 50);
  }

  async #syncPwaFragments() {
    const contributions: PwaContribution[] = [];
    for (const [name, loadedPackage] of this.#packages) {
      const manifest = loadedPackage.manifest;
      let config: PHConnectPwa = {};
      if (manifest.pwa) {
        // Third-party package code must not inject arbitrary manifest fields the
        // SW will serve — validate strictly and skip (with a warning) on failure.
        const parsed = PwaConfigSchema.safeParse(manifest.pwa);
        if (parsed.success) {
          // A package's assets live at its base (CDN for registry installs);
          // make relative icon srcs absolute so the served manifest resolves.
          const importUrl = this.#storage.get(name)?.importUrl ?? null;
          const baseUrl = importUrl
            ? importUrl.replace(/browser\/index\.js$/, "")
            : null;
          config = resolveFragmentAssetUrls(parsed.data, baseUrl);
        } else {
          console.warn(
            `[Connect][PWA] "${name}" ships an invalid pwa fragment; skipped.`,
            parsed.error,
          );
        }
      }
      // `categories` is derived from the manifest's `category` field (not
      // authored under `pwa`); it unions into the SW-served manifest so a
      // runtime-installed package's category shows up like a build-time one.
      config = withInferredCategory(config, manifest.category);
      if (Object.keys(config).length === 0) continue;
      contributions.push({ source: name, config });
    }
    // Fold in load order (base-first ordering is preserved so a package cannot
    // hijack the built-in .phd/.phdm handler at merge time either).
    const merged = mergePwaConfig(contributions);
    // Most package operations don't touch PWA config; skip the write + manifest
    // re-attach (which forces a redundant manifest re-fetch) when unchanged.
    const mergedJson = JSON.stringify(merged);
    if (mergedJson === this.#lastSyncedFragmentJson) return;
    try {
      await writeMergedPwaFragment(merged);
    } catch (error) {
      // Leave #lastSyncedFragmentJson unset so a later sync retries the write.
      console.debug(
        "[Connect][PWA] fragment mirror to IndexedDB failed:",
        error,
      );
      return;
    }
    this.#lastSyncedFragmentJson = mergedJson;
    // The SW serves the manifest fresh from IndexedDB, but the browser only
    // parsed <link rel="manifest"> at page load — re-attach it so it
    // re-consumes the now-updated manifest without a manual reload. (Kept out
    // of the write's try/catch so a DOM error isn't mislabeled as an IDB
    // failure; refreshPwaManifestLink is itself non-throwing.)
    refreshPwaManifestLink();
  }
}
