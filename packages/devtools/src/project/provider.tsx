import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  fetchProjectFileList,
  fetchProjectDocumentModel,
  fetchProjectFile,
  fetchProjectSnapshot,
  refusedForThisPage,
  type DevtoolsApiFailureCode,
  type DevtoolsApiResult,
} from "../api-client.js";
import type {
  ProjectFileList,
  ProjectDocumentModelDetail,
  ProjectFileText,
  ProjectModuleKind,
  ProjectSection,
  ProjectSnapshot,
} from "../api.js";
import { Poller } from "../lib/poller.js";
import type { Badge } from "../shell/registry.js";
import { worstCheck } from "./checks.js";
import { projectModules, type ProjectModule } from "./kinds.js";

export type ProjectView =
  | { state: "loading" }
  | { state: "unavailable"; code: DevtoolsApiFailureCode; message: string }
  | {
      state: "ready";
      snapshot: ProjectSnapshot;
      /** Why the last poll failed. The snapshot is the last one that arrived. */
      staleMessage?: string;
      staleCode?: DevtoolsApiFailureCode;
    };

export const PROJECT_POLL_MS = 2000;

const NOT_READ = "This dev server does not read the project's code.";

export type ProjectResource<T> =
  | { state: "loading" }
  | { state: "unavailable"; message: string }
  | {
      state: "ready";
      data: T;
      /** Why the last read failed. The data is the last that arrived. */
      staleMessage?: string;
    };

const LOADING: ProjectResource<never> = { state: "loading" };

type Load<T> = (apiBase: string, key: string) => Promise<DevtoolsApiResult<T>>;

/** What one route answered per key. A key is read while something on screen
 * retains it: once per revision of the project, and again after a read that
 * did not get through. The last good answer stays until a new one arrives. */
class ResourceCache<T> {
  #load: Load<T>;
  #changed: () => void;
  #retained = new Map<string, number>();
  /** The revision each key was asked at, unless that read failed. */
  #asked = new Map<string, string>();
  #held = new Map<string, ProjectResource<T>>();

  constructor(load: Load<T>, changed: () => void) {
    this.#load = load;
    this.#changed = changed;
  }

  get = (key: string): ProjectResource<T> => this.#held.get(key) ?? LOADING;

  retain(key: string): () => void {
    this.#retained.set(key, (this.#retained.get(key) ?? 0) + 1);
    return () => {
      const count = (this.#retained.get(key) ?? 1) - 1;
      if (count > 0) this.#retained.set(key, count);
      else this.#retained.delete(key);
    };
  }

  /** Lets go of what nothing retains: a file's text can be 256 KiB. */
  dropUnretained(): void {
    for (const key of new Set([...this.#held.keys(), ...this.#asked.keys()])) {
      if (this.#retained.has(key)) continue;
      this.#held.delete(key);
      this.#asked.delete(key);
    }
  }

  /** Answers the retained keys that have none yet with `message`: nothing
   * is read any more. */
  refuse(message: string): void {
    let changed = false;
    for (const key of this.#retained.keys()) {
      if (this.#held.has(key)) continue;
      this.#held.set(key, { state: "unavailable", message });
      changed = true;
    }
    if (changed) this.#changed();
  }

  /** Reads the retained keys that have no answer for `revision` yet. */
  sync(apiBase: string, revision: string): void {
    for (const key of this.#retained.keys()) {
      if (this.#asked.get(key) !== revision) this.#read(apiBase, key, revision);
    }
  }

  #read(apiBase: string, key: string, revision: string): void {
    this.#asked.set(key, revision);
    void this.#load(apiBase, key).then((result) => {
      if (this.#asked.get(key) !== revision) return;
      const held = this.#held.get(key);
      if (result.ok) {
        this.#held.set(key, { state: "ready", data: result.data });
      } else {
        // What the project does not have stays so until its revision changes.
        if (result.code !== "not_found") this.#asked.delete(key);
        this.#held.set(
          key,
          held?.state === "ready"
            ? { ...held, staleMessage: result.message }
            : { state: "unavailable", message: result.message },
        );
      }
      this.#changed();
    });
  }
}

/** None changes while this page stays open: the token and the address come
 * with the page, and a server that reads no project keeps doing so. */
const stopsPolling = (code: DevtoolsApiFailureCode) =>
  refusedForThisPage(code) || code === "not_found";

const loadFileList: Load<ProjectFileList> = (apiBase) =>
  fetchProjectFileList(apiBase);

/** Polls the snapshot while something reads it and the page is visible. */
class ProjectStore {
  readonly apiBase: string;
  readonly documentModels: ResourceCache<ProjectDocumentModelDetail>;
  readonly fileList: ResourceCache<ProjectFileList>;
  readonly files: ResourceCache<ProjectFileText>;
  #view: ProjectView = { state: "loading" };
  #listeners = new Set<() => void>();
  #poller = new Poller((signal) => this.#read(signal));

  constructor(apiBase: string) {
    this.apiBase = apiBase;
    const notify = () => this.#notify();
    this.documentModels = new ResourceCache(fetchProjectDocumentModel, notify);
    this.fileList = new ResourceCache(loadFileList, notify);
    this.files = new ResourceCache(fetchProjectFile, notify);
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    if (this.#listeners.size === 1) this.#poller.start();
    return () => {
      this.#listeners.delete(listener);
      if (this.#listeners.size === 0) this.#poller.stop();
    };
  };

  getView = (): ProjectView => this.#view;

  get #caches() {
    return [this.documentModels, this.fileList, this.files] as const;
  }

  /** Reads what the pages on screen need of the current revision. It runs
   * after every poll that got through, so a read that failed is tried again. */
  syncResources(): void {
    if (this.#view.state !== "ready") return;
    const { staleCode, staleMessage } = this.#view;
    if (staleCode !== undefined && stopsPolling(staleCode)) {
      for (const cache of this.#caches) cache.refuse(staleMessage ?? "");
      return;
    }
    if (staleMessage) return;
    const { revision } = this.#view.snapshot;
    for (const cache of this.#caches) cache.sync(this.apiBase, revision);
  }

  async #read(signal: AbortSignal): Promise<number | undefined> {
    const held = this.#view.state === "ready" ? this.#view.snapshot : undefined;
    const result = await fetchProjectSnapshot(
      this.apiBase,
      held?.revision,
      signal,
    );
    if (signal.aborted) return undefined;

    if (result.ok) {
      const snapshot = result.data.modified ? result.data.snapshot : held;
      if (snapshot) this.#publish({ state: "ready", snapshot });
      // Here, not on every retain: a page that moves between the dock and
      // the standalone page lets go of a key and retains it again at once.
      for (const cache of this.#caches) cache.dropUnretained();
      this.syncResources();
      return PROJECT_POLL_MS;
    }
    const message = result.code === "not_found" ? NOT_READ : result.message;
    this.#publish(
      held
        ? {
            state: "ready",
            snapshot: held,
            staleMessage: message,
            staleCode: result.code,
          }
        : { state: "unavailable", code: result.code, message },
    );
    this.syncResources();
    return stopsPolling(result.code) ? undefined : PROJECT_POLL_MS;
  }

  #publish(view: ProjectView): void {
    if (sameView(view, this.#view)) return;
    this.#view = view;
    this.#notify();
  }

  #notify(): void {
    for (const listener of this.#listeners) listener();
  }
}

function sameView(a: ProjectView, b: ProjectView): boolean {
  if (a.state === "ready" && b.state === "ready") {
    return (
      a.snapshot === b.snapshot &&
      a.staleMessage === b.staleMessage &&
      a.staleCode === b.staleCode
    );
  }
  if (a.state === "unavailable" && b.state === "unavailable") {
    return a.message === b.message && a.code === b.code;
  }
  return a.state === b.state;
}

const ProjectContext = createContext<ProjectStore | undefined>(undefined);

export function ProjectProvider({
  apiBase,
  children,
}: {
  apiBase: string;
  children: ReactNode;
}) {
  const store = useMemo(() => new ProjectStore(apiBase), [apiBase]);
  return (
    <ProjectContext.Provider value={store}>{children}</ProjectContext.Provider>
  );
}

function useProjectStore(): ProjectStore {
  const store = useContext(ProjectContext);
  if (!store) throw new Error("useProject needs a ProjectProvider above it.");
  return store;
}

export function useProject(): ProjectView {
  const store = useProjectStore();
  return useSyncExternalStore(store.subscribe, store.getView);
}

/** The modules of one kind, or undefined until the project has been read. */
export function useProjectModules(
  kind: ProjectModuleKind,
): ProjectSection<ProjectModule> | undefined {
  const view = useProject();
  const snapshot = view.state === "ready" ? view.snapshot : undefined;
  return useMemo(
    () => snapshot && projectModules(snapshot, kind),
    [snapshot, kind],
  );
}

/** How many modules of the kind have a check that did not pass. */
export function useModuleKindBadge(kind: ProjectModuleKind): Badge | undefined {
  const section = useProjectModules(kind);
  return useMemo(() => {
    if (!section?.ok) return undefined;
    const states = section.items
      .map(({ module }) => worstCheck(module.checks))
      .filter((state) => state === "warn" || state === "fail");
    if (states.length === 0) return undefined;
    return {
      count: states.length,
      tone: states.includes("fail") ? "error" : "warn",
    };
  }, [section]);
}

function useCached<T>(
  store: ProjectStore,
  cache: ResourceCache<T>,
  key: string,
): ProjectResource<T> {
  useEffect(() => {
    const release = cache.retain(key);
    store.syncResources();
    return release;
  }, [store, cache, key]);
  return useSyncExternalStore(store.subscribe, () => cache.get(key));
}

/** One model in full, read again when the project's revision changes. */
export function useDocumentModelDetail(
  documentType: string,
): ProjectResource<ProjectDocumentModelDetail> {
  const store = useProjectStore();
  return useCached(store, store.documentModels, documentType);
}

/** The files of each module. */
export function useProjectFileList(): ProjectResource<ProjectFileList> {
  const store = useProjectStore();
  return useCached(store, store.fileList, "files");
}

/** One file's text, as `project/files` lists it, read again when the
 * project's revision changes. */
export function useProjectFile(path: string): ProjectResource<ProjectFileText> {
  const store = useProjectStore();
  return useCached(store, store.files, path);
}

/** The project's folder, for the links that open its files. Undefined until
 * the project is read. */
export function useProjectRoot(): string | undefined {
  const store = useProjectStore();
  const view = useSyncExternalStore(store.subscribe, store.getView);
  return view.state === "ready" ? view.snapshot.root : undefined;
}
