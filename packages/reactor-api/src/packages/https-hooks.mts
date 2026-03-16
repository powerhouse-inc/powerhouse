import { get } from "node:https";
import { get as httpGet } from "node:http";

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

  // For bare specifiers (e.g. "document-model/core") imported from HTTP modules,
  // Node's default resolver fails because it can't find node_modules from an HTTP parent.
  // Fall back to resolving from the process's working directory instead.
  if (
    parentURL &&
    (parentURL.startsWith("https://") || parentURL.startsWith("http://"))
  ) {
    const { pathToFileURL } = await import("node:url");
    const localParent = pathToFileURL(process.cwd() + "/").href;
    return nextResolve(specifier, { ...context, parentURL: localParent });
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
      source,
    };
  }

  // Handle HTTP URLs (for local development)
  if (url.startsWith("http://")) {
    const source = await fetchModule(url, httpGet);
    return {
      format: "module",
      shortCircuit: true,
      source,
    };
  }

  // Let Node.js handle all other URLs
  return nextLoad(url, context);
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
