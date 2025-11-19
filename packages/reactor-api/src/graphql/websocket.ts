let useServerImpl: any = null;

if (process.env.VITEST !== "true" && process.env.NODE_ENV !== "test") {
  try {
    // @ts-expect-error - graphql-ws subpath not resolved by TypeScript
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const mod = await import("graphql-ws/use/ws");
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    useServerImpl = mod.useServer;
  } catch (error) {
    console.warn(
      "Failed to load graphql-ws WebSocket server. Subscriptions will not work.",
      error,
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
export const useServer =
  useServerImpl ||
  (() => {
    throw new Error(
      "WebSocket server not available in test mode. Set NODE_ENV=production to enable.",
    );
  });
