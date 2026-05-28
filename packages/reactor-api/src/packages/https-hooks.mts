import { get as httpGet } from "node:http";
import { get } from "node:https";

/**
 * Node.js module loader hooks that enable importing from HTTP/HTTPS URLs.
 * See: https://nodejs.org/docs/latest-v24.x/api/module.html#import-from-https
 */

type ResolveContext = { parentURL?: string; conditions?: string[] };
type ResolveResult = {
  url: string;
  shortCircuit?: boolean;
  format?: string;
};
type NextResolve = (
  specifier: string,
  context: ResolveContext,
) => Promise<ResolveResult>;

type LoadContext = { format?: string };
type LoadResult = { format: string; shortCircuit?: boolean; source: string };
type NextLoad = (url: string, context: LoadContext) => Promise<LoadResult>;

/**
 * Resolve hook: resolves relative specifiers against HTTP/HTTPS parent URLs.
 */
export async function resolve(
  specifier: string,
  context: ResolveContext,
  nextResolve: NextResolve,
): Promise<ResolveResult> {
  const { parentURL } = context;

  // If the specifier is already an HTTP(S) URL, resolve it directly
  if (specifier.startsWith("https://") || specifier.startsWith("http://")) {
    return { url: specifier, shortCircuit: true, format: "module" };
  }

  // If the parent is an HTTP(S) URL and specifier is relative, resolve against it.
  // Only handle relative specifiers (./ or ../), not bare package specifiers.
  if (
    parentURL &&
    (parentURL.startsWith("https://") || parentURL.startsWith("http://")) &&
    (specifier.startsWith("./") || specifier.startsWith("../"))
  ) {
    const resolved = new URL(specifier, parentURL).href;
    return { url: resolved, shortCircuit: true, format: "module" };
  }

  // Bare specifiers from HTTP modules need a node_modules root to resolve
  // against. Under pnpm's strict isolation the deps a registry-built bundle
  // needs split into two classes:
  //   - Peer deps the *consumer* declared (react, react-dom, graphql, …) —
  //     live at the consumer project root.
  //   - Things reactor-api keeps external by design (the reactor-api package
  //     itself, for class identity; internal helpers) — live in reactor-api's
  //     own tree.
  // Neither root sees the other under strict mode, so try the consumer first
  // (its declared peers win on version) and fall back to reactor-api's tree.
  //
  // At this point: specifier is not an http(s):// URL (branch 1) and not
  // relative (branch 2). Only redirect bare package specifiers; let absolute
  // paths and other URL schemes (e.g. "node:fs", "file://…") fall through.
  if (
    parentURL &&
    (parentURL.startsWith("https://") || parentURL.startsWith("http://"))
  ) {
    const isBareSpecifier =
      !specifier.startsWith("/") && !/^[a-z][a-z0-9+.-]*:/i.test(specifier);
    if (isBareSpecifier) {
      const { pathToFileURL } = await import("node:url");
      const consumerRoot = pathToFileURL(process.cwd() + "/").href;
      try {
        return await nextResolve(specifier, {
          ...context,
          parentURL: consumerRoot,
        });
      } catch (e) {
        const code = (e as NodeJS.ErrnoException | undefined)?.code;
        if (code !== "ERR_MODULE_NOT_FOUND") throw e;
        return nextResolve(specifier, {
          ...context,
          parentURL: import.meta.url,
        });
      }
    }
  }

  // Let Node.js handle all other specifiers
  return nextResolve(specifier, context);
}

/**
 * Load hook: fetches module source from HTTP/HTTPS URLs.
 */
export async function load(
  url: string,
  context: LoadContext,
  nextLoad: NextLoad,
): Promise<LoadResult> {
  // Handle HTTPS URLs
  if (url.startsWith("https://")) {
    const source = await fetchModule(url, get);
    return {
      format: "module",
      shortCircuit: true,
      source: patchCreateRequire(source),
    };
  }

  // Handle HTTP URLs (for local development)
  if (url.startsWith("http://")) {
    const source = await fetchModule(url, httpGet);
    return {
      format: "module",
      shortCircuit: true,
      source: patchCreateRequire(source),
    };
  }

  // Let Node.js handle all other URLs
  return nextLoad(url, context);
}

/**
 * Rewrite `createRequire(import.meta.url)` in HTTP-loaded modules so that
 * `createRequire` receives a local file URL instead of an HTTP URL it cannot handle.
 */
function patchCreateRequire(source: string): string {
  return source.replace(
    /createRequire\(import\.meta\.url\)/g,
    `createRequire(new URL("file://" + process.cwd() + "/"))`,
  );
}

function fetchModule(
  url: string,
  getter: typeof get | typeof httpGet,
): Promise<string> {
  return new Promise((resolve, reject) => {
    getter(url, (res) => {
      // Handle redirects
      if (
        res.statusCode &&
        res.statusCode >= 300 &&
        res.statusCode < 400 &&
        res.headers.location
      ) {
        const redirectUrl = res.headers.location;
        const redirectGetter = redirectUrl.startsWith("https://")
          ? get
          : httpGet;
        fetchModule(redirectUrl, redirectGetter).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`Failed to fetch ${url}: ${res.statusCode}`));
        return;
      }

      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
      res.on("error", reject);
    }).on("error", reject);
  });
}

/**
 * Path to this hooks file for use with node:module register()
 */
export const httpsHooksPath: string = import.meta.url;
