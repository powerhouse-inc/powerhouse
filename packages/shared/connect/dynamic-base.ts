/**
 * The base a dynamic-base Connect build is compiled against. The build emits
 * this literal wherever a base-relative URL would go, and the serving layer
 * (the dynamic-base vite plugin at build time, the connect proxy at serve
 * time) rewrites it to the base the app is actually deployed under.
 *
 * It lives here, in the browser-safe shared package, rather than in
 * `@powerhousedao/builder-tools`, because both the node-only build toolchain
 * and Connect's own browser code need it. Importing builder-tools from app
 * code pulls the whole build toolchain (and its node-only `read-pkg`
 * dependency) into the browser graph.
 */
export const DYNAMIC_BASE_PLACEHOLDER = "/__PH_DYNAMIC_BASE__/";

// A regex literal: the dynamic-base plugin rewrites string literals, so the string
// constant above reads as the runtime base in rebuilt (e.g. vendored) code.
const PLACEHOLDER_TOKEN = /\/__PH_DYNAMIC_BASE__\//;

/** Swaps a build-time placeholder in `url` for `runtimeBase`; URLs without one pass through. */
export function resolveDynamicBaseUrl(url: string, runtimeBase: string) {
  return url.replace(PLACEHOLDER_TOKEN, runtimeBase);
}
