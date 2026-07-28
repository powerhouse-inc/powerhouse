import type {
  WalletAdapter,
  WalletAdapterDescriptor,
  WalletAdapterMeta,
} from "./types.js";

// True when a URL search string looks like a wallet OAuth redirect return, per
// each adapter's own declared params — no adapter-specific strings live here.
export function isWalletRedirectReturn(
  search: string,
  metas: WalletAdapterMeta[],
): boolean {
  const params = new URLSearchParams(search);
  return metas.some((meta) =>
    meta.redirectReturnParams.some((param) => params.has(param)),
  );
}

// Load the descriptors the host passed in, pairing each resolved implementation
// with its already-eager meta so identity is declared in exactly one place.
export async function resolveAdapters(
  descriptors: WalletAdapterDescriptor[] | undefined,
): Promise<WalletAdapter[]> {
  if (!descriptors || descriptors.length === 0) return [];
  // allSettled, not all: one broken loader must not take the others down.
  const settled = await Promise.allSettled(
    descriptors.map((descriptor) => descriptor.load()),
  );

  const adapters: WalletAdapter[] = [];
  const failures: string[] = [];
  settled.forEach((result, index) => {
    const { meta } = descriptors[index];
    if (result.status === "fulfilled") {
      adapters.push({ ...result.value, meta });
    } else {
      failures.push(`${meta.id}: ${describeError(result.reason)}`);
    }
  });

  if (adapters.length === 0) {
    throw new Error(
      `No wallet adapter could be loaded. ${failures.join("; ")}`,
    );
  }
  if (failures.length > 0) {
    console.error(
      `[renown] Some wallet adapters failed to load. ${failures.join("; ")}`,
    );
  }
  return adapters;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
