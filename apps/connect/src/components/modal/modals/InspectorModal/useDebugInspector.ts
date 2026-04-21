import { clearReactorStorage } from "@powerhousedao/connect/store";
import { useReactorClientModule } from "@powerhousedao/reactor-browser";
import { useCallback } from "react";

const SUPPORTED_PG_VERSIONS = [16, 17] as const;

async function seedFreshIdb(major: number): Promise<void> {
  if (major === 16) {
    const { PGlite } = await import("pglite-legacy-02");
    const pg = new PGlite("idb://reactor");
    try {
      await pg.waitReady;
    } finally {
      await pg.close();
    }
    return;
  }
  if (major === 17) {
    const { PGlite } = await import("@electric-sql/pglite");
    const pg = new PGlite("idb://reactor");
    try {
      await pg.waitReady;
    } finally {
      await pg.close();
    }
    return;
  }
  throw new Error(`Unsupported PG major version for reset: ${major}`);
}

export function useDebugInspector() {
  const reactorClientModule = useReactorClientModule();
  const reactor = reactorClientModule?.reactorModule?.reactor;

  const onResetToPgVersion = useCallback(
    async (major: number) => {
      if (reactor) {
        const status = reactor.kill();
        await status.completed;
      }

      await clearReactorStorage();

      await seedFreshIdb(major);

      window.location.reload();
    },
    [reactor],
  );

  return {
    supportedPgVersions: SUPPORTED_PG_VERSIONS,
    onResetToPgVersion,
  };
}
