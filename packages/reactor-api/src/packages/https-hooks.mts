import { get } from "node:https";
import { get as httpGet } from "node:http";

/**
 * Node.js module loader hooks that enable importing from HTTP/HTTPS URLs.
 * See: https://nodejs.org/docs/latest-v24.x/api/module.html#import-from-https
 */

type LoadContext = { format?: string };
type LoadResult = { format: string; shortCircuit?: boolean; source: string };
type NextLoad = (url: string, context: LoadContext) => Promise<LoadResult>;

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
