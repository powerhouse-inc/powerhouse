import { describe, expect, it } from "vitest";
import { createMemoryAuthStore } from "../src/auth/auth-store.js";
import registryAuthPlugin, {
  type RegistryAuthPluginConfig,
} from "../src/auth/registry-auth-plugin.js";
import { wasStoreLoaded } from "../src/auth/store-handoff.js";
import type { RegistryConfig } from "../src/types.js";
import { buildVerdaccioConfig } from "../src/verdaccio-config.js";

// Regression: with S3 active, verdaccio merges the app config (incl. the
// top-level `store` block) into each plugin config — so a token is used, not `store`.
function baseConfig(overrides: Partial<RegistryConfig> = {}): RegistryConfig {
  return {
    port: 8080,
    storagePath: "/tmp/storage",
    cdnCachePath: "/tmp/cdn-cache",
    ...overrides,
  };
}

type PluginConf = { storeToken?: string; store?: unknown };
function call(
  fn: (cb: (err: Error | null, res?: unknown) => void) => void,
): Promise<{ err: Error | null; res?: unknown }> {
  return new Promise((resolve) => fn((err, res) => resolve({ err, res })));
}

const s3 = {
  bucket: "b",
  endpoint: "http://s3",
  region: "r",
  s3ForcePathStyle: true,
} as const;

// Mirror verdaccio's legacyMergeConfigs: _.merge({}, appConfig, pluginConfig)
// lands the app-level S3 `store` block onto the plugin config as `store`.
function mergePluginConfig(
  cfg: { auth: Record<string, Record<string, unknown>> } & Record<
    string,
    unknown
  >,
): RegistryAuthPluginConfig & { store: unknown } {
  return {
    ...cfg,
    ...cfg.auth["registry-auth"],
  } as unknown as RegistryAuthPluginConfig & { store: unknown };
}

describe("auth store handoff (S3 config-merge safety)", () => {
  it("emits a store token, never a `store` key", () => {
    const cfg = buildVerdaccioConfig(
      baseConfig({
        authStore: createMemoryAuthStore(),
        databaseUrl: "postgresql://x",
        s3,
      }),
    ) as unknown as { auth: Record<string, PluginConf> };

    const pluginConf = cfg.auth["registry-auth"];
    expect(typeof pluginConf.storeToken).toBe("string");
    expect("store" in pluginConf).toBe(false);
  });

  it("resolves the injected store even when the S3 `store` block is merged in", async () => {
    const store = createMemoryAuthStore();
    const cfg = buildVerdaccioConfig(
      baseConfig({ authStore: store, databaseUrl: "postgresql://x", s3 }),
    ) as unknown as {
      auth: Record<string, Record<string, unknown>>;
      store: Record<string, unknown>;
    };

    const merged = mergePluginConfig(cfg);
    expect(merged.store).toBeDefined(); // the S3 block — must be ignored

    const plugin = registryAuthPlugin(merged);
    const claim = await call((cb) =>
      plugin.allow_publish(
        { name: "did:pkh:eip155:1:0xabc" },
        { name: "p" },
        cb,
      ),
    );
    expect(claim.err).toBeNull();
    expect(await store.getOwners("p")).toEqual(["did:pkh:eip155:1:0xabc"]);
  });

  it("marks the token loaded once the plugin constructs (fail-fast signal)", () => {
    const cfg = buildVerdaccioConfig(
      baseConfig({ authStore: createMemoryAuthStore(), s3 }),
    ) as unknown as { auth: Record<string, Record<string, unknown>> };
    const token = cfg.auth["registry-auth"].storeToken as string;

    // Before the plugin loads, the launcher's fail-fast check would fire.
    expect(wasStoreLoaded(token)).toBe(false);

    registryAuthPlugin(mergePluginConfig(cfg));
    expect(wasStoreLoaded(token)).toBe(true);
  });
});
