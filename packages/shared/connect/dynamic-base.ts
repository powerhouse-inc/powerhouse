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
