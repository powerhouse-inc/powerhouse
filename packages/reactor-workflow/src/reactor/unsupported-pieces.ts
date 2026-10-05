// Pieces whose ACTIONS only run inside the Activepieces platform (ctx.server
// AI proxy, or platform agents/todos/tables/flows APIs). Hidden everywhere.
export const SERVER_ONLY_PIECES = new Set<string>([
  // Platform AI proxy (v1/ai-providers): no own auth, keys live server-side.
  "@activepieces/piece-ai",
  "@activepieces/piece-text-ai",
  "@activepieces/piece-image-ai",
  "@activepieces/piece-utility-ai",
  // AI proxy + platform agents API (ctx.agent.tools).
  "@activepieces/piece-agent",
  // Platform-feature APIs: todos, tables, calling other platform flows.
  "@activepieces/piece-todos",
  "@activepieces/piece-tables",
  "@activepieces/piece-subflows",
]);
