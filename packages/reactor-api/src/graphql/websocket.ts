import type { useServer as wsUseServer } from "graphql-ws/use/ws";

let useServerImpl: typeof wsUseServer | null = null;

if (process.env.VITEST !== "true" && process.env.NODE_ENV !== "test") {
  try {
    const { useServer } = await import("graphql-ws/use/ws");
    useServerImpl = useServer;
  } catch (error) {
    console.warn(
      "Failed to load graphql-ws WebSocket server. Subscriptions will not work.",
      error,
    );
  }
}

export const useServer =
  useServerImpl ||
  (() => {
    throw new Error(
      "WebSocket server not available in test mode. Set NODE_ENV=production to enable.",
    );
  });
