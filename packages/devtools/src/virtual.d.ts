/** DevTools' compiled stylesheet as text, from `cssText` in css-text.mjs. */
declare module "virtual:ph-devtools-css" {
  const css: string;
  export default css;
}

/** The self-contained mount, which the dev server resolves to its build. */
declare module "virtual:ph-devtools/mount" {
  export {
    mountDevtools,
    type DevtoolsHandle,
  } from "@powerhousedao/devtools/mount";
}

/** Connect's router entry, which a project resolves and this package does
 * not depend on. */
declare module "@powerhousedao/connect/router" {
  export { registerConnectPage } from "@powerhousedao/connect-core/router";
}
