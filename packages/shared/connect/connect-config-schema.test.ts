import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DRIVES_PRESERVE_STRATEGIES } from "../clis/constants.js";
import { z } from "zod";
import {
  connectConfigSchema,
  connectConfigSchemaWith,
  connectDrivePreserveStrategySchema,
  connectRuntimeConfigSchema,
  declaredConnectConfigSchema,
} from "./connect-config-schema.js";
import { phConnectRuntimeConfigSchema } from "./schema-fragments.js";

// A copy of the `connect` block of Sektar's powerhouse.config.json.
const sektarConnect: unknown = JSON.parse(
  readFileSync(
    new URL("./fixtures/sektar-connect-config.json", import.meta.url),
    "utf8",
  ),
);

const instance = { namespace: null, reactorWorker: false };
const layer = { src: "a.png", position: { top: 0, left: "10%" }, width: 40 };

// [name, connect block, accepted]. Run through the old hand-written JSON
// Schema (Ajv) when the zod schema replaced it; every row agreed.
const cases: [string, unknown, boolean][] = [
  ["empty", {}, true],
  ["unknown root key", { bogus: 1 }, false],
  ["loader as a path", { branding: { loader: "x.png" } }, true],
  ["loader null", { branding: { loader: null } }, true],
  [
    "loader with null animation and size",
    { branding: { loader: { src: "x", animation: null, size: null } } },
    true,
  ],
  [
    "loader animation outside the enum",
    { branding: { loader: { src: "x", animation: "wobble" } } },
    false,
  ],
  [
    "loader size below 16",
    { branding: { loader: { src: "x", size: 10 } } },
    false,
  ],
  ["loader without src", { branding: { loader: { size: 20 } } }, false],
  ["home background null", { home: { background: null } }, true],
  ["home background as a path", { home: { background: "a.png" } }, true],
  [
    "home background layers",
    {
      home: {
        background: {
          color: { light: "#fff", dark: null },
          layers: [{ ...layer, src: { light: "a", dark: "b" }, fade: null }],
        },
      },
    },
    true,
  ],
  [
    "home background without layers",
    { home: { background: { color: "#fff" } } },
    false,
  ],
  [
    "layer opacity above 1",
    { home: { background: { layers: [{ src: "a", opacity: 2 }] } } },
    false,
  ],
  [
    "layer with an unknown edge",
    { home: { background: { layers: [{ src: "a", position: { mid: 1 } }] } } },
    false,
  ],
  ["drives.icons null", { drives: { icons: null } }, true],
  [
    "drives.icons per document type",
    { drives: { icons: { folder: null, documents: { "acme/invoice": "i" } } } },
    true,
  ],
  [
    "drives.icons document icon null",
    { drives: { icons: { documents: { "acme/invoice": null } } } },
    false,
  ],
  [
    "remote and local default drives",
    {
      drives: {
        defaultDrives: [
          { url: "https://x/d/a", name: null, icon: "i" },
          { local: true, id: "x", app: "a", name: "n" },
        ],
      },
    },
    true,
  ],
  [
    "default drive mixing remote and local",
    { drives: { defaultDrives: [{ url: "u", local: true, id: "x" }] } },
    false,
  ],
  [
    "local default drive with local: false",
    { drives: { defaultDrives: [{ local: false, id: "x" }] } },
    false,
  ],
  ["unknown preserveStrategy", { drives: { preserveStrategy: "nope" } }, false],
  ["legacy public section", { drives: { sections: { public: {} } } }, false],
  ["sentry dsn null", { sentry: { dsn: null } }, true],
  ["instance without reactorWorker", { instance: { namespace: null } }, false],
  [
    "instance with every authored field",
    { instance: { namespace: "x", reactorWorker: true, multiReactor: true } },
    true,
  ],
  ["renown chainId as a string", { renown: { chainId: "abc" } }, false],
  [
    "renown adapters",
    {
      renown: {
        adapters: {
          rainbow: { walletConnectProjectId: "w" },
          privy: { appId: "a", methods: ["email"] },
        },
      },
    },
    true,
  ],
  ["unknown renown adapter", { renown: { adapters: { metamask: {} } } }, false],
  [
    "reactor settings",
    {
      reactor: {
        featureFlags: { documentDecisions: true },
        createSignaturePolicy: "legacy",
        unsupportedStoredDocuments: "read-only",
      },
    },
    true,
  ],
  ["app logLevel outside the enum", { app: { logLevel: "trace" } }, false],
  [
    "every pwa field",
    {
      pwa: {
        manifest: {
          name: "n",
          display: "standalone",
          icons: [{ src: "a", sizes: "1x1" }],
          file_handlers: [
            { accept: { "text/csv": [".csv"] }, launch_type: "single-client" },
          ],
          launch_handler: { client_mode: "auto" },
        },
        globPatterns: ["a"],
        maximumFileSizeToCacheInBytes: 5,
        runtimeCaching: [
          {
            urlPattern: { source: "^x", flags: "i" },
            handler: "CacheFirst",
            method: "GET",
            options: { cacheableResponse: { headers: { a: "b" } } },
          },
        ],
        navigateFallbackDenylist: ["/api", { source: "x" }],
      },
    },
    true,
  ],
  [
    "file extension without a dot",
    {
      pwa: {
        manifest: { file_handlers: [{ accept: { "text/csv": ["csv"] } }] },
      },
    },
    false,
  ],
  [
    "file handler with an action",
    { pwa: { manifest: { file_handlers: [{ accept: {}, action: "/x" }] } } },
    false,
  ],
];

// Never authored: derived by the build or projected by the host runner.
const runtimeOnly: [string, unknown][] = [
  [
    "composition",
    { composition: [{ module: "@powerhousedao/connect/generic" }] },
  ],
  [
    "instance.reactorClient",
    { instance: { ...instance, reactorClient: "worker" } },
  ],
  [
    "pwa.manifest.categories",
    { pwa: { manifest: { categories: ["finance"] } } },
  ],
  [
    "instance.remoteBackends",
    {
      instance: {
        ...instance,
        remoteBackends: [{ name: "sb", url: "http://localhost:4001/d/b" }],
      },
    },
  ],
  [
    "instance.collections",
    {
      instance: {
        ...instance,
        collections: { workflows: { backend: "sb", sync: false } },
      },
    },
  ],
  [
    "drives.defaultDrives[].backend and .sync",
    {
      drives: {
        defaultDrives: [
          { url: "http://localhost:4001/d/b", backend: "sb", sync: false },
        ],
      },
    },
  ],
];

describe("connectConfigSchema", () => {
  it("accepts Sektar's connect block", () => {
    expect(connectConfigSchema.safeParse(sektarConnect).error).toBeUndefined();
  });

  it.each(cases)("%s", (_name, value, accepted) => {
    expect(connectConfigSchema.safeParse(value).success).toBe(accepted);
  });

  it.each(runtimeOnly)(
    "rejects the runtime-only %s, which the served schema accepts",
    (_name, value) => {
      expect(connectConfigSchema.safeParse(value).success).toBe(false);
      expect(connectRuntimeConfigSchema.safeParse(value).success).toBe(true);
    },
  );

  it("keeps the served schema strict", () => {
    expect(connectRuntimeConfigSchema.safeParse({ bogus: 1 }).success).toBe(
      false,
    );
    const instanceExtra = { instance: { ...instance, bogus: 1 } };
    expect(connectRuntimeConfigSchema.safeParse(instanceExtra).success).toBe(
      false,
    );
  });

  it("fills no defaults on parse", () => {
    const input = { app: {}, instance };
    expect(connectConfigSchema.parse(input)).toEqual(input);
  });

  it("rejects a RegExp pattern that does not compile", () => {
    const value = { pwa: { navigateFallbackDenylist: [{ source: "(" }] } };
    expect(connectConfigSchema.safeParse(value).success).toBe(false);
  });

  it("preserveStrategy mirrors DRIVES_PRESERVE_STRATEGIES", () => {
    expect(connectDrivePreserveStrategySchema.options).toEqual([
      ...DRIVES_PRESERVE_STRATEGIES,
    ]);
  });
});

const driveUrl = {
  $output: { host: "switchboard", path: ["drives", "sektar", "url"] },
};
const graphqlUrl = {
  $output: { host: "switchboard", path: ["endpoints", "graphql"] },
};

describe("declaredConnectConfigSchema (a connect host's config)", () => {
  it("takes output tokens in the fields that name another host's outputs", () => {
    const value = {
      drives: {
        defaultDrives: [
          { url: driveUrl, name: "Sektar" },
          { url: { $concat: [graphqlUrl, "/d/x"] } },
          { local: true, id: "scratch" },
        ],
      },
      renown: { switchboardUrl: graphqlUrl },
    };
    expect(declaredConnectConfigSchema.safeParse(value).error).toBeUndefined();
    // the plain schema (powerhouse.config.json, the served config) does not
    expect(connectConfigSchema.safeParse(value).success).toBe(false);
  });

  it.each([
    ["renown.url", { renown: { url: graphqlUrl } }],
    [
      "a drive name",
      { drives: { defaultDrives: [{ url: "u", name: driveUrl }] } },
    ],
    [
      "a local drive id",
      { drives: { defaultDrives: [{ local: true, id: driveUrl }] } },
    ],
    [
      "a $map as a drive url",
      {
        drives: {
          defaultDrives: [{ url: { $map: { over: driveUrl, to: "x" } } }],
        },
      },
    ],
  ])("rejects a token in %s", (_name, value) => {
    expect(declaredConnectConfigSchema.safeParse(value).success).toBe(false);
  });

  it("agrees with the plain schema on every token-free case, and on Sektar's block", () => {
    for (const [, value, accepted] of cases) {
      expect(declaredConnectConfigSchema.safeParse(value).success).toBe(
        accepted,
      );
    }
    expect(declaredConnectConfigSchema.parse(sektarConnect)).toEqual(
      connectConfigSchema.parse(sektarConnect),
    );
  });

  it("emits the plain schema's JSON Schema, plus tokens in the token-able fields", () => {
    const plain = z.toJSONSchema(connectConfigSchema, { io: "input" });
    const declared = z.toJSONSchema(declaredConnectConfigSchema, {
      io: "input",
    }) as typeof plain & { $defs?: unknown };
    const sections = (schema: typeof plain) =>
      (schema.properties ?? {}) as Record<
        string,
        { properties?: Record<string, unknown> }
      >;
    // descriptions and defaults survive the rebuilt fields
    expect(declared.description).toBe(plain.description);
    const { drives, renown, ...rest } = sections(declared);
    const {
      drives: plainDrives,
      renown: plainRenown,
      ...plainRest
    } = sections(plain);
    expect(rest).toEqual(plainRest);
    const meta = (field: unknown) => {
      const { description, default: fallback } = field as {
        description?: string;
        default?: unknown;
      };
      return { description, default: fallback };
    };
    for (const [section, plainSection] of [
      [drives, plainDrives],
      [renown, plainRenown],
    ] as const) {
      expect(Object.keys(section.properties ?? {})).toEqual(
        Object.keys(plainSection.properties ?? {}),
      );
      for (const key of Object.keys(plainSection.properties ?? {})) {
        expect(meta(section.properties?.[key])).toEqual(
          meta(plainSection.properties?.[key]),
        );
      }
    }
    // the token shapes (in $defs: $concat is recursive) only in the declared
    expect(JSON.stringify(declared)).toContain('"$output"');
    expect(JSON.stringify(plain)).not.toContain('"$output"');
  });

  it("is the plain schema when the field wrapper adds no token branch", () => {
    const resolved = connectConfigSchemaWith((schema) => z.union([schema]));
    expect(
      resolved.safeParse({ drives: { defaultDrives: [{ url: driveUrl }] } })
        .success,
    ).toBe(false);
    expect(
      resolved.safeParse({ drives: { defaultDrives: [{ url: "u" }] } }).success,
    ).toBe(true);
  });
});

describe("emitted JSON Schema fragment", () => {
  it("is embeddable: no $schema, $ref or $defs", () => {
    const json = JSON.stringify(phConnectRuntimeConfigSchema);
    expect(json).not.toMatch(/"\$(schema|ref|defs)"/);
  });

  it("declares only the authored sections", () => {
    expect(Object.keys(phConnectRuntimeConfigSchema.properties ?? {})).toEqual(
      Object.keys(connectConfigSchema.shape),
    );
  });

  // Drift pin: a change to the zod schema changes the snapshot. The snapshot
  // sorts keys, so it pins the fragment's content, not its key order. Review
  // the diff, update with `vitest -u`, then rerun scripts/emit-schemas.ts.
  it("matches the pinned fragment", () => {
    expect(phConnectRuntimeConfigSchema).toMatchSnapshot();
  });
});
