import { describe, expect, it } from "vitest";
import { switchboardOfDrive } from "../src/schema.js";
import {
  childrenSchema,
  compoundHostSchema,
  declaredHostSchemas,
  defineHostSchemas,
  hostNameSchema,
  placementKeyIssues,
  profileSchema,
  reactorHostSchema,
  reactorBackendSchema,
  reactorSchema,
} from "../src/host-schemas.js";

describe("reactorSchema (strict per D2.d)", () => {
  it("accepts a full valid block", () => {
    const result = reactorSchema.safeParse({
      backends: {
        main: {
          kind: "in-process",
          storage: { kind: "path", dataDir: "./.ph/data" },
          readModel: { url: "dev.db" },
          packages: { dynamic: true },
        },
        remote: { kind: "remote", remote: { url: "https://sb.example/d/b" } },
      },
      placement: { primary: "main", drives: { b: "remote" } },
      workflows: true,
      protocol: {
        featureFlags: { documentDecisions: true },
        createSignaturePolicy: "v2-required",
        unsupportedStoredDocuments: "refuse",
      },
    });
    expect(result.success).toBe(true);
  });

  it("takes a remote backend's drive address on the page origin, and nothing else that is not one", () => {
    const at = (url: string) =>
      reactorSchema.safeParse({
        backends: { sb: { kind: "remote", remote: { url } } },
      }).success;
    expect(at("${origin}/d/powerhouse")).toBe(true);
    expect(at("http://127.0.0.1:7540/d/powerhouse")).toBe(true);
    // A GraphQL endpoint names no drive, on the page origin as anywhere
    expect(at("${origin}/graphql")).toBe(false);
    expect(at("${origin}")).toBe(false);
    expect(at("/d/powerhouse")).toBe(false);
    expect(at("origin/d/powerhouse")).toBe(false);
    expect(at("x${origin}/d/powerhouse")).toBe(false);
  });

  it("rejects a typo'd protocol key with its path (fleet-consensus safety)", () => {
    const result = reactorSchema.safeParse({
      protocol: { featureFlags: { documentDecisionz: true } },
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("documentDecisionz");
  });

  it("rejects unknown top-level reactor keys", () => {
    expect(reactorSchema.safeParse({ consensus: {} }).success).toBe(false);
  });

  it("rejects an invalid storage kind and signature policy", () => {
    expect(
      reactorSchema.safeParse({
        backends: { main: { storage: { kind: "sqlite" } } },
      }).success,
    ).toBe(false);
    expect(
      reactorSchema.safeParse({
        protocol: { createSignaturePolicy: "v3" },
      }).success,
    ).toBe(false);
  });
});

describe("hostNameSchema", () => {
  it.each(["vetra", "my-project-switchboard", "Lab_2.v1"])(
    "accepts %j",
    (name) => {
      expect(hostNameSchema.safeParse(name).success).toBe(true);
    },
  );

  it.each([
    "",
    ".",
    "..",
    "../x",
    "a/b",
    "a\\b",
    "/abs",
    "C:x",
    ".hidden",
    "a b",
    "x".repeat(129),
  ])("refuses %j", (name) => {
    expect(hostNameSchema.safeParse(name).success).toBe(false);
  });

  it("constrains both host shapes", () => {
    const runner = { module: "m" };
    expect(reactorHostSchema.safeParse({ name: "../x", runner }).success).toBe(
      false,
    );
    expect(
      compoundHostSchema.safeParse({ name: "../x", runner, children: {} })
        .success,
    ).toBe(false);
  });
});

describe("profileSchema", () => {
  it("accepts the documented fields, rejects unknown ones", () => {
    expect(
      profileSchema.safeParse({
        appId: "inc.powerhouse.vetra",
        name: "Vetra",
        description: "Builder studio",
        icon: "./icon.svg",
      }).success,
    ).toBe(true);
    expect(profileSchema.safeParse({ displayName: "x" }).success).toBe(false);
  });
});

describe("reactorBackendSchema — one data dir per PGlite store", () => {
  it("refuses readModel.url equal to the reactor's path storage dir", () => {
    const result = reactorBackendSchema.safeParse({
      kind: "in-process",
      storage: { kind: "path", dataDir: "${userData}/pglite" },
      readModel: { url: "${userData}/pglite/" },
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain(
      "two PGlite instances on one data dir",
    );
  });

  it("accepts distinct dirs, an omitted readModel, and a postgres url for both", () => {
    expect(
      reactorBackendSchema.safeParse({
        kind: "in-process",
        storage: { kind: "path", dataDir: "${userData}/.ph/reactor-storage" },
        readModel: { url: "${userData}/.ph/read-storage" },
      }).success,
    ).toBe(true);
    expect(
      reactorBackendSchema.safeParse({
        kind: "in-process",
        storage: { kind: "path", dataDir: "${userData}/.ph/reactor-storage" },
      }).success,
    ).toBe(true);
    // one Postgres database serving both stores is legitimate (two pools)
    expect(
      reactorBackendSchema.safeParse({
        kind: "in-process",
        storage: { kind: "postgres", url: "postgres://db/ph" },
        readModel: { url: "postgres://db/ph" },
      }).success,
    ).toBe(true);
  });
});

describe("childrenSchema", () => {
  it("accepts wrappers and validates member reactor overrides strictly", () => {
    expect(
      childrenSchema.safeParse({
        "vetra-switchboard": {
          host: "switchboard",
          runner: { port: 7064 },
          reactor: { workflows: true },
        },
      }).success,
    ).toBe(true);
    expect(
      childrenSchema.safeParse({
        member: { host: "switchboard", reactor: { workflowz: true } },
      }).success,
    ).toBe(false);
  });

  it("leaves port 0 on a wrapper to the member's runner", () => {
    expect(
      childrenSchema.safeParse({
        member: { host: "switchboard", runner: { port: 0 } },
      }).success,
    ).toBe(true);
    expect(
      childrenSchema.safeParse({
        member: { host: "switchboard", runner: { port: 65536 } },
      }).success,
    ).toBe(false);
  });
});

const messages = (result: {
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) =>
  (result.error?.issues ?? []).map(
    (i) => `${i.path.map(String).join(".")}: ${i.message}`,
  );

describe("remote.url is a switchboard drive address", () => {
  const remote = (url: unknown) => ({
    backends: { sb: { kind: "remote", remote: { url } } },
  });

  it("is re-exported from the neutral entry", () => {
    expect(switchboardOfDrive("http://h:1/d/a")?.graphql).toBe(
      "http://h:1/graphql",
    );
  });

  it("accepts a drive address and refuses a GraphQL url (resolved form)", () => {
    expect(
      reactorSchema.safeParse(remote("http://localhost:4001/d/powerhouse"))
        .success,
    ).toBe(true);
    expect(
      messages(
        reactorSchema.safeParse(remote("http://localhost:4001/graphql")),
      ),
    ).toEqual([
      'backends.sb.remote.url: remote.url must be a switchboard drive address (<switchboard>/d/<slug>), not http://localhost:4001/graphql: sync needs the drive. Use remote: { url: switchboard.drives.<slug>.url } with switchboard from ../switchboard/outputs.js, or remote: { url: { $output: { host: "switchboard", path: ["drives", "<slug>", "url"] } } }.',
    ]);
  });

  it("names the drive token that replaces an endpoints.graphql token (declared form)", () => {
    const declared = declaredHostSchemas.reactorSchema;
    expect(
      messages(
        declared.safeParse(
          remote({
            $output: {
              host: "lab",
              member: "sb-b",
              path: ["endpoints", "graphql"],
            },
          }),
        ),
      ),
    ).toEqual([
      'backends.sb.remote.url: remote.url reads lab\'s endpoints.graphql; it must be a switchboard drive address (<switchboard>/d/<slug>): sync needs the drive. Use remote: { url: lab.drives.<slug>.url } with lab from ../lab/outputs.js, or remote: { url: { $output: { host: "lab", member: "sb-b", path: ["drives", "<slug>", "url"] } } }.',
    ]);
    expect(
      declared.safeParse(
        remote({ $output: { host: "lab", path: ["drives", "a", "url"] } }),
      ).success,
    ).toBe(true);
  });

  it("refuses two remote backends on the same switchboard", () => {
    expect(
      messages(
        reactorSchema.safeParse({
          backends: {
            a: { kind: "remote", remote: { url: "http://h:1/api/d/x" } },
            b: { kind: "remote", remote: { url: "http://h:1/api/d/y/" } },
            c: { kind: "remote", remote: { url: "http://h:2/d/x" } },
          },
        }),
      ),
    ).toEqual([
      'backends.b.remote.url: backends "a" and "b" both open drives on the same switchboard (http://h:1/api). Keep "a", and list the second drive under reactor.drives with its remote.url instead.',
    ]);
  });
});

describe("placement.drives", () => {
  const backends = {
    main: { kind: "worker" },
    sb: { kind: "remote", remote: { url: "http://sb:1/d/home" } },
    other: { kind: "remote", remote: { url: "http://other:1/d/x" } },
  };
  const drives = [
    { slug: "local" },
    { slug: "b", remote: { url: "http://sb:1/d/b" } },
    { slug: "far", remote: { url: "http://other:1/d/far" } },
  ];
  const place = (placed: Record<string, string>) =>
    reactorSchema.safeParse({
      backends,
      drives,
      placement: { drives: placed },
    });

  it("accepts a drive on its own switchboard, a home drive and a local copy", () => {
    expect(
      place({ b: "sb", home: "sb", x: "other", far: "main" }).success,
    ).toBe(true);
  });

  it("refuses a backend that does not exist", () => {
    expect(messages(place({ b: "nope" }))).toEqual([
      'placement.drives.b: placement.drives.b names backend "nope", which is not in backends (main, sb, other).',
    ]);
  });

  it("refuses a drive on another switchboard's backend", () => {
    expect(messages(place({ far: "sb", home: "other" }))).toEqual([
      'placement.drives.far: placement.drives.far opens drive "far" on "sb" (http://sb:1), but the drive is on http://other:1. Place it on the backend for that switchboard.',
      'placement.drives.home: placement.drives.home opens drive "home" on "other" (http://other:1), but the drive is on http://sb:1. Place it on the backend for that switchboard.',
    ]);
  });

  it("refuses to open a drive this reactor keeps on a remote", () => {
    expect(messages(place({ local: "sb" }))).toEqual([
      'placement.drives.local: placement.drives.local opens drive "local" on "sb", but this reactor keeps that drive itself. Only a drive on a switchboard can open there without a copy.',
    ]);
  });

  it("passes keys in the declared form while the drive list is a $map", () => {
    const declared = declaredHostSchemas.reactorSchema;
    const mapped = {
      backends: {
        sb: {
          kind: "remote",
          remote: {
            url: { $output: { host: "s", path: ["drives", "a", "url"] } },
          },
        },
      },
      drives: {
        $map: {
          over: { $output: { host: "s", path: ["drives"] } },
          to: { slug: { $key: true }, remote: { url: { $item: ["url"] } } },
        },
      },
    };
    expect(
      declared.safeParse({ ...mapped, placement: { drives: { b: "sb" } } })
        .success,
    ).toBe(true);
    expect(
      messages(
        declared.safeParse({ ...mapped, placement: { drives: { b: "x" } } }),
      ),
    ).toEqual([
      'placement.drives.b: placement.drives.b names backend "x", which is not in backends (sb).',
    ]);
  });
});

describe("placement.drives keys (declared form, host level)", () => {
  const { declaredHostSchema } = defineHostSchemas((s) => s.reactorHostSchema);
  const token = (slug: string) => ({
    $output: { host: "s", path: ["drives", slug, "url"] },
  });
  const host = (reactor: Record<string, unknown>, plugins?: unknown[]) => ({
    name: "app",
    runner: { module: "m", ...(plugins ? { plugins } : {}) },
    reactor,
  });
  const linked = (extra: Record<string, unknown>) => ({
    backends: {
      main: { kind: "worker" },
      sb: { kind: "remote", remote: { url: token("home") } },
    },
    drives: [{ slug: "local" }, { slug: "b", remote: { url: token("b") } }],
    ...extra,
  });
  const check = (value: unknown) => declaredHostSchema.safeParse(value);

  it("accepts a home drive by its token slug and a reactor.drives slug", () => {
    expect(
      check(
        host(
          linked({
            placement: { drives: { home: "sb", b: "sb", local: "main" } },
          }),
        ),
      ).success,
    ).toBe(true);
  });

  it("flags a key that names no drive, listing the known ones", () => {
    expect(
      messages(check(host(linked({ placement: { drives: { typo: "sb" } } })))),
    ).toEqual([
      "reactor.placement.drives.typo: placement.drives.typo names no drive this host links to or declares (home, local, b).",
    ]);
  });

  it("gives the same issues through placementKeyIssues", () => {
    expect(
      placementKeyIssues(
        host(linked({ placement: { drives: { typo: "sb" } } })),
      ),
    ).toEqual([
      {
        path: ["reactor", "placement", "drives", "typo"],
        message:
          "placement.drives.typo names no drive this host links to or declares (home, local, b).",
      },
    ]);
    expect(
      placementKeyIssues(host(linked({ placement: { drives: { b: "sb" } } }))),
    ).toEqual([]);
    expect(placementKeyIssues({ name: "app" })).toEqual([]);
  });

  it("knows a drive a plugin attaches by its config.drive link", () => {
    const workflows = {
      module: "@powerhousedao/connect/plugins/workflows",
      config: { drive: token("workflows") },
    };
    const reactor = {
      backends: {
        main: { kind: "worker" },
        sb: { kind: "remote", remote: { url: token("b") } },
      },
      drives: [{ slug: "a" }],
      placement: { drives: { workflows: "sb" } },
    };
    expect(check(host(reactor, [workflows])).success).toBe(true);
    expect(
      check(
        host(reactor, [
          { ...workflows, config: { drive: "http://h:1/d/workflows" } },
        ]),
      ).success,
    ).toBe(true);
    // a plugin drive only runtime knows: nothing is checked
    expect(
      check(
        host({ ...reactor, placement: { drives: { other: "sb" } } }, [
          { ...workflows, config: { drive: { $env: "DRIVE_URL" } } },
        ]),
      ).success,
    ).toBe(true);
    expect(
      messages(
        check(
          host({ ...reactor, placement: { drives: { other: "sb" } } }, [
            workflows,
          ]),
        ),
      ),
    ).toEqual([
      "reactor.placement.drives.other: placement.drives.other names no drive this host links to or declares (b, a, workflows).",
    ]);
  });

  it("matches a literal home address by its slug, hashed or not", () => {
    const literal = (url: string, key: string) =>
      check(
        host({
          backends: { sb: { kind: "remote", remote: { url } } },
          placement: { drives: { [key]: "sb" } },
        }),
      ).success;
    expect(literal("http://h:1/d/b", "b")).toBe(true);
    expect(literal("http://h:1/d/vetra-0f1e2d3c", "vetra")).toBe(true);
    expect(literal("http://h:1/d/vetra-0f1e2d3c", "vet")).toBe(false);
  });

  it("passes keys it cannot know until runtime", () => {
    const concat = {
      backends: {
        sb: {
          kind: "remote",
          remote: {
            url: {
              $concat: [{ $output: { host: "s", path: ["origin"] } }, "/d/x"],
            },
          },
        },
      },
      placement: { drives: { anything: "sb" } },
    };
    expect(check(host(concat)).success).toBe(true);
    const mapped = {
      ...linked({}),
      drives: {
        $map: {
          over: { $output: { host: "s", path: ["drives"] } },
          to: { slug: { $key: true }, remote: { url: { $item: ["url"] } } },
        },
      },
      placement: { drives: { anything: "sb" } },
    };
    expect(check(host(mapped)).success).toBe(true);
    // no remote backend: plugin-contributed drives are not named anywhere
    expect(
      check(
        host({
          backends: { main: { kind: "in-process" } },
          placement: { drives: { workflows: "main" } },
        }),
      ).success,
    ).toBe(true);
  });
});

describe("placement.drives: one slug on two switchboards (resolved form)", () => {
  it("refuses the key, naming both backends, whichever backend it names", () => {
    const backends = {
      main: { kind: "worker" },
      sb1: { kind: "remote", remote: { url: "http://a:1/d/powerhouse" } },
      sb2: { kind: "remote", remote: { url: "http://b:2/d/powerhouse" } },
    };
    for (const placed of ["sb1", "sb2", "main"]) {
      expect(
        messages(
          reactorSchema.safeParse({
            backends,
            placement: { drives: { powerhouse: placed } },
          }),
        ),
      ).toEqual([
        'placement.drives.powerhouse: Drive "powerhouse" is on both sb1 and sb2. Rename one, or link only one.',
      ]);
    }
  });

  it("refuses a slug that is both this reactor's own drive and on a switchboard", () => {
    for (const placed of ["sb", "main"]) {
      expect(
        messages(
          reactorSchema.safeParse({
            backends: {
              main: { kind: "worker" },
              sb: {
                kind: "remote",
                remote: { url: "http://a:1/d/powerhouse" },
              },
            },
            drives: [{ slug: "powerhouse" }],
            placement: { drives: { powerhouse: placed } },
          }),
        ),
      ).toEqual([
        'placement.drives.powerhouse: Drive "powerhouse" is both this reactor\'s own drive and on sb. Rename one, or link only one.',
      ]);
    }
  });

  it("sees a reactor.drives entry on another switchboard too", () => {
    expect(
      messages(
        reactorSchema.safeParse({
          backends: {
            sb1: { kind: "remote", remote: { url: "http://a:1/d/home" } },
            sb2: { kind: "remote", remote: { url: "http://b:2/d/home2" } },
          },
          drives: [
            { slug: "x", remote: { url: "http://a:1/d/x" } },
            { slug: "x", remote: { url: "http://b:2/d/x" } },
          ],
          placement: { drives: { x: "sb2" } },
        }),
      ),
    ).toEqual([
      'placement.drives.x: Drive "x" is on both sb1 and sb2. Rename one, or link only one.',
    ]);
  });
});

describe("reactor.drives[].remote.url is a drive address (resolved form)", () => {
  it("refuses a GraphQL url", () => {
    expect(
      messages(
        reactorSchema.safeParse({
          drives: [{ slug: "b", remote: { url: "http://a:1/graphql" } }],
        }),
      ),
    ).toEqual([
      'drives.0.remote.url: remote.url must be a switchboard drive address (<switchboard>/d/<slug>), not http://a:1/graphql: sync needs the drive. Use url: switchboard.drives.<slug>.url, or url: { $output: { host: "switchboard", path: ["drives", "<slug>", "url"] } }.',
    ]);
  });
});
