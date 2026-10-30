/**
 * Browser-side AI chat over the reactor (`@powerhousedao/reactor-browser/ai`).
 *
 * A bottom-right FAB opens a chat window driven by an OpenAI-compatible
 * endpoint configured by the user in the browser. The agent acts on the
 * reactor through tool descriptors supplied by the host app (see
 * `ReactorChatFab`'s `getTools`), with per-write approval by default.
 *
 * A host app can instead embed `ChatPanel` and point `useReactorChat` at a
 * switchboard's AI gateway (`gatewayConnection`), which holds the provider key
 * server side, so no key reaches the browser.
 */
export * from "./agent.js";
export * from "./components/index.js";
export * from "./context.js";
export * from "./gateway.js";
export * from "./images.js";
export * from "./settings-store.js";
export * from "./switchboard.js";
export * from "./types.js";
export * from "./use-reactor-chat.js";
