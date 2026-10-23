import { init, parse, type ImportSpecifier } from "es-module-lexer";

/** A bare specifier's URL in the shared table: an exact entry, else the longest trailing-slash prefix, as an import map does. */
export function resolveSharedSpecifier(
  specifier: string,
  imports: Record<string, string>,
): string | undefined {
  if (Object.hasOwn(imports, specifier)) return imports[specifier];
  let best: string | undefined;
  for (const key of Object.keys(imports)) {
    if (
      key.endsWith("/") &&
      specifier.startsWith(key) &&
      (best === undefined || key.length > best.length)
    ) {
      best = key;
    }
  }
  return best === undefined
    ? undefined
    : imports[best] + specifier.slice(best.length);
}

function isRelative(specifier: string): boolean {
  return (
    specifier.startsWith("./") ||
    specifier.startsWith("../") ||
    specifier.startsWith("/")
  );
}

function isUrl(specifier: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(specifier);
}

type ParsedModule = {
  url: string;
  source: string;
  imports: readonly ImportSpecifier[];
  /** Absolute URLs of the relative imports. */
  deps: string[];
  /** Bare specifiers, which need the shared table. */
  bare: string[];
};

export type ModuleGraphOptions = {
  sharedImports?: Record<string, string>;
  /** Reads a module's source; defaults to fetch. */
  fetchSource?: (url: string) => Promise<string>;
  /** Makes a rewritten source importable; defaults to a blob URL. */
  createModuleUrl?: (source: string) => string;
  /** Told about dynamic imports with computed specifiers, which stay as they are. */
  warn?: (message: string) => void;
};

async function fetchModuleSource(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} for ${url}`);
  }
  return response.text();
}

function blobModuleUrl(source: string): string {
  return URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
}

// Makes a package's modules importable without an import map (a worker): each module that reaches
// a bare specifier is rewritten onto the shared table and its rewritten deps; the rest keep their URL.
export class ModuleGraph {
  private readonly sharedImports: Record<string, string>;
  private readonly fetchSource: (url: string) => Promise<string>;
  private readonly createModuleUrl: (source: string) => string;
  private readonly warn: (message: string) => void;
  // By absolute URL and across packages, so a shared chunk is one module instance.
  private readonly parsed = new Map<string, Promise<ParsedModule>>();
  private readonly built = new Map<string, Promise<string>>();

  constructor(options: ModuleGraphOptions = {}) {
    this.sharedImports = options.sharedImports ?? {};
    this.fetchSource = options.fetchSource ?? fetchModuleSource;
    this.createModuleUrl = options.createModuleUrl ?? blobModuleUrl;
    this.warn = options.warn ?? ((message) => console.warn(message));
  }

  /** The URL to import in place of `entryUrl`; `entryUrl` itself when nothing needed a rewrite. */
  async resolve(entryUrl: string): Promise<string> {
    const modules = await this.collect(entryUrl);
    this.assertMapped(entryUrl, modules);
    const rewrite = this.needsRewrite(modules);
    this.assertAcyclic(entryUrl, modules, rewrite);
    return this.build(entryUrl, modules, rewrite);
  }

  private async collect(entryUrl: string): Promise<Map<string, ParsedModule>> {
    const modules = new Map<string, ParsedModule>();
    const seen = new Set<string>();
    const visit = async (url: string): Promise<void> => {
      if (seen.has(url)) return;
      seen.add(url);
      const module = await this.parse(url);
      modules.set(url, module);
      await Promise.all(module.deps.map(visit));
    };
    await visit(entryUrl);
    return modules;
  }

  private parse(url: string): Promise<ParsedModule> {
    let pending = this.parsed.get(url);
    if (!pending) {
      pending = this.readModule(url);
      // A failed fetch is retried by the next load, not cached.
      pending.catch(() => this.parsed.delete(url));
      this.parsed.set(url, pending);
    }
    return pending;
  }

  private async readModule(url: string): Promise<ParsedModule> {
    const source = await this.fetchSource(url);
    await init;
    const [imports] = parse(source, url);
    const deps: string[] = [];
    const bare: string[] = [];
    for (const specifier of imports) {
      if (specifier.d === -2) continue;
      const name = specifier.n;
      if (name === undefined) {
        this.warn(
          `[module-graph] ${url} has a dynamic import with a computed specifier; it is left as is`,
        );
        continue;
      }
      if (isRelative(name)) {
        deps.push(new URL(name, url).href);
      } else if (!isUrl(name)) {
        bare.push(name);
      }
    }
    return { url, source, imports, deps: [...new Set(deps)], bare };
  }

  // A rewritten module's URL must exist before its importers are written, so those can't import each other.
  private assertAcyclic(
    entryUrl: string,
    modules: Map<string, ParsedModule>,
    rewrite: Set<string>,
  ): void {
    const state = new Map<string, "visiting" | "done">();
    const stack: string[] = [];
    const visit = (url: string): void => {
      const seen = state.get(url);
      if (seen === "done") return;
      if (seen === "visiting") {
        const cycle = [...stack.slice(stack.indexOf(url)), url];
        throw new Error(
          `Can't load ${entryUrl} in the worker: its modules import each other (${cycle.join(" -> ")})`,
        );
      }
      state.set(url, "visiting");
      stack.push(url);
      for (const dep of modules.get(url)!.deps) {
        if (rewrite.has(dep)) visit(dep);
      }
      stack.pop();
      state.set(url, "done");
    };
    for (const url of [entryUrl, ...rewrite]) {
      if (rewrite.has(url)) visit(url);
    }
  }

  private assertMapped(
    entryUrl: string,
    modules: Map<string, ParsedModule>,
  ): void {
    for (const module of modules.values()) {
      for (const name of module.bare) {
        if (resolveSharedSpecifier(name, this.sharedImports) === undefined) {
          throw new Error(
            `Can't load ${entryUrl} in the worker: ${module.url} imports "${name}", which the host doesn't share with the worker`,
          );
        }
      }
    }
  }

  // The modules that reach a bare specifier, directly or through a dependency.
  private needsRewrite(modules: Map<string, ParsedModule>): Set<string> {
    const importers = new Map<string, string[]>();
    for (const module of modules.values()) {
      for (const dep of module.deps) {
        importers.set(dep, [...(importers.get(dep) ?? []), module.url]);
      }
    }
    const rewrite = new Set<string>();
    const queue = [...modules.values()]
      .filter((module) => module.bare.length > 0)
      .map((module) => module.url);
    while (queue.length > 0) {
      const url = queue.pop()!;
      if (rewrite.has(url)) continue;
      rewrite.add(url);
      queue.push(...(importers.get(url) ?? []));
    }
    return rewrite;
  }

  private build(
    url: string,
    modules: Map<string, ParsedModule>,
    rewrite: Set<string>,
  ): Promise<string> {
    if (!rewrite.has(url)) return Promise.resolve(url);
    let pending = this.built.get(url);
    if (!pending) {
      pending = this.rewrite(modules.get(url)!, modules, rewrite);
      pending.catch(() => this.built.delete(url));
      this.built.set(url, pending);
    }
    return pending;
  }

  private async rewrite(
    module: ParsedModule,
    modules: Map<string, ParsedModule>,
    rewrite: Set<string>,
  ): Promise<string> {
    const depUrls = new Map<string, string>();
    await Promise.all(
      module.deps.map(async (dep) => {
        depUrls.set(dep, await this.build(dep, modules, rewrite));
      }),
    );
    let out = "";
    let last = 0;
    for (const specifier of module.imports) {
      const name = specifier.n;
      if (specifier.d === -2 || name === undefined || isUrl(name)) continue;
      const target = isRelative(name)
        ? depUrls.get(new URL(name, module.url).href)!
        : resolveSharedSpecifier(name, this.sharedImports)!;
      // A dynamic import's range includes its quotes; a static one's doesn't.
      const replacement = specifier.d > -1 ? JSON.stringify(target) : target;
      out += module.source.slice(last, specifier.s) + replacement;
      last = specifier.e;
    }
    return this.createModuleUrl(out + module.source.slice(last));
  }
}
