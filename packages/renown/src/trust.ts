// Worker-safe entry for verifying signers (the root re-exports init.browser).
export { resolveSwitchboardEndpoint } from "./discovery.js";
export * from "./signer-trust.js";
