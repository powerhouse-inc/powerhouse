import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  emitHostJsonSchema,
  validateDeclaredHost,
  validateHost,
} from "@powerhousedao/host-core";
import type {
  HostSchemaLike,
  PHHost,
  PHHostOutputs,
} from "@powerhousedao/host-core";
import { describe, expect, expectTypeOf, it } from "vitest";
import * as cliRunner from "../src/runners/cli-runner.js";
import * as proxyRunner from "../src/runners/proxy-runner.js";
import * as mastraRunner from "../src/runners/mastra-runner.js";

/** The runner modules as validateHost sees them (spread: the index-signature
 * shape of RunnerModule, no cast). */
const MASTRA = "@powerhousedao/clint/mastra-runner";
const CLI = "@powerhousedao/clint/cli-runner";
const mastra = { ...mastraRunner };
const cliRun = { ...cliRunner };
/** validateDeclaredHost takes an untyped RunnerModule; its verbs are unused. */
const untyped = (module: {
  kind: "reactor" | "compound";
  hostSchema: HostSchemaLike;
  declaredHostSchema: HostSchemaLike;
}) => ({
  kind: module.kind,
  hostSchema: module.hostSchema,
  declaredHostSchema: module.declaredHostSchema,
  run: () => Promise.resolve(undefined),
});

/** The scaffold/Sektar assistant host as DECLARED: a literal model, the key
 * as an `$env` token and the switchboard endpoint as an `$output` token. The
 * `satisfies PHHost` is the type-level half of the contract. */
const declaredAssistantHost = () =>
  ({
    name: "assistant",
    runner: { module: MASTRA, port: 4910 },
    profile: { appId: "inc.powerhouse.assistant.lab", name: "Lab Assistant" },
    reactor: {
      backends: {
        switchboard: {
          kind: "remote",
          remote: {
            url: {
              $output: {
                host: "switchboard",
                path: ["drives", "powerhouse", "url"],
              },
            },
          },
        },
      },
      protocol: {},
    },
    config: {
      model: "openrouter/anthropic/claude-sonnet-4.5",
      apiKey: { $env: "OPENROUTER_API_KEY" },
      instructions: "You are the lab assistant.",
      prompts: { skillsDir: "agents", outDir: "dist/skills" },
    },
  }) satisfies PHHost;

/** The same host RESOLVED: what the verbs receive. */
const assistantHost = () => {
  const host = declaredAssistantHost();
  return {
    ...host,
    reactor: {
      ...host.reactor,
      backends: {
        switchboard: {
          kind: "remote",
          remote: { url: "http://127.0.0.1:4001/d/powerhouse" },
        },
      },
    },
    config: { ...host.config, apiKey: "sk-or-test" },
  };
};

/** A cli-runner host as DECLARED: a package's Cli, attached to the
 * switchboard's drive by an `$output` token. */
const declaredCliRunnerHost = () =>
  ({
    name: "tools",
    runner: { module: CLI },
    config: { package: "@acme/tools" },
    reactor: {
      backends: {
        switchboard: {
          kind: "remote",
          remote: {
            url: {
              $output: {
                host: "switchboard",
                path: ["drives", "powerhouse", "url"],
              },
            },
          },
        },
      },
    },
  }) satisfies PHHost;

/** The same host RESOLVED. */
const cliRunnerHost = () => {
  const host = declaredCliRunnerHost();
  return {
    ...host,
    reactor: {
      backends: {
        switchboard: {
          kind: "remote",
          remote: { url: "http://127.0.0.1:4001/d/powerhouse" },
        },
      },
    },
  };
};

const validate = {
  mastra: (host: unknown) =>
    validateHost(mastra, MASTRA, host, "hosts/assistant/host.js"),
  cli: (host: unknown) =>
    validateHost(cliRun, CLI, host, "hosts/tools/host.js"),
};

describe("mastra-runner host contract", () => {
  it("accepts the scaffold assistant host", () => {
    const parsed = validate.mastra(assistantHost());
    expect(parsed.config?.model).toBe("openrouter/anthropic/claude-sonnet-4.5");
    expect(parsed.config?.apiKey).toBe("sk-or-test");
  });

  it("declared form: apiKey takes an $env or $output token", () => {
    const host = declaredAssistantHost();
    expect(mastraRunner.declaredHostSchema.safeParse(host).success).toBe(true);
    expect(
      mastraRunner.declaredHostSchema.safeParse({
        ...host,
        config: {
          ...host.config,
          apiKey: { $output: { host: "vault", path: ["keys", "openrouter"] } },
        },
      }).success,
    ).toBe(true);
  });

  it("resolved form: apiKey is a string, tokens are rejected", () => {
    const result = mastraRunner.hostSchema.safeParse(declaredAssistantHost());
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([
      ["config", "apiKey"],
      ["reactor", "backends", "switchboard", "remote", "url"],
    ]);
  });

  it("ph run's pipeline: the declared host passes declared validation, a leftover token fails the resolved one", () => {
    const file = "hosts/assistant/host.js";
    expect(() =>
      validateDeclaredHost(
        untyped(mastra),
        MASTRA,
        declaredAssistantHost(),
        file,
      ),
    ).not.toThrow();
    expect(() =>
      validateHost(mastra, MASTRA, declaredAssistantHost(), file),
    ).toThrow(/is an unresolved output token/);
  });

  it("rejects an unknown runner key, including the retired workdir", () => {
    const host = assistantHost();
    expect(() =>
      validate.mastra({ ...host, runner: { ...host.runner, workDir: "x" } }),
    ).toThrow(/runner: Unrecognized key: "workDir"/);
    expect(() =>
      validate.mastra({
        ...host,
        runner: { ...host.runner, workdir: "${userData}/assistant" },
      }),
    ).toThrow(/runner: Unrecognized key: "workdir"/);
  });

  it("rejects a defaultVerb typo", () => {
    const host = assistantHost();
    expect(() =>
      validate.mastra({
        ...host,
        runner: { ...host.runner, defaultVerb: "serv" },
      }),
    ).toThrow(/defaultVerb "serv" is not a verb/);
  });

  it("rejects unknown config and top-level keys", () => {
    const host = assistantHost();
    expect(() =>
      validate.mastra({ ...host, config: { ...host.config, modle: "x" } }),
    ).toThrow(/config: Unrecognized key: "modle"/);
    expect(() =>
      validate.mastra({
        ...host,
        config: { ...host.config, prompts: { skillDir: "a" } },
      }),
    ).toThrow(/config\.prompts: Unrecognized key: "skillDir"/);
    expect(() => validate.mastra({ ...host, reactr: {} })).toThrow(
      /Unrecognized key: "reactr"/,
    );
  });

  it("outputsSchema is strict and URL-typed", () => {
    const outputs = {
      origin: "http://127.0.0.1:4910",
      endpoints: {
        openai: "http://127.0.0.1:4910/v1",
        ready: "http://127.0.0.1:4910/ready",
      },
    };
    expect(mastraRunner.outputsSchema.parse(outputs)).toEqual(outputs);
    expect(
      mastraRunner.outputsSchema.safeParse({ ...outputs, port: 4910 }).success,
    ).toBe(false);
    expect(
      mastraRunner.outputsSchema.safeParse({ ...outputs, origin: "4910" })
        .success,
    ).toBe(false);
  });
});

describe("cli-runner host contract", () => {
  it("is a reactor runner whose arguments all go to the Cli", () => {
    expect(cliRunner.kind).toBe("reactor");
    expect(cliRunner.argsSchema).toEqual({
      options: [],
      flags: [],
      passthrough: true,
    });
    // No outputs: start-run neither locks nor records it; the runner records
    // a Cli that keeps running itself.
    expect("outputsSchema" in cliRunner).toBe(false);
  });

  it("accepts a package's Cli on a switchboard drive", () => {
    const parsed = validate.cli(cliRunnerHost());
    expect(parsed.config?.package).toBe("@acme/tools");
    expect(parsed.reactor?.backends?.switchboard?.remote?.url).toBe(
      "http://127.0.0.1:4001/d/powerhouse",
    );
    // Without config the project's own ./cli runs; without a reactor the
    // Cli keeps its own.
    expect(() =>
      validate.cli({ name: "tools", runner: { module: CLI } }),
    ).not.toThrow();
  });

  it("declared form: remote.url takes the switchboard's output token", () => {
    const file = "hosts/tools/host.js";
    expect(() =>
      validateDeclaredHost(untyped(cliRun), CLI, declaredCliRunnerHost(), file),
    ).not.toThrow();
    expect(() =>
      validateHost(cliRun, CLI, declaredCliRunnerHost(), file),
    ).toThrow(/is an unresolved output token/);
  });

  it("resolved form: remote.url must be a drive address", () => {
    const host = cliRunnerHost();
    expect(() =>
      validate.cli({
        ...host,
        reactor: {
          backends: {
            switchboard: {
              kind: "remote",
              remote: { url: "http://127.0.0.1:4001/graphql" },
            },
          },
        },
      }),
    ).toThrow(/must be a switchboard drive address/);
  });

  it("rejects unknown config, runner and top-level keys, and children", () => {
    const host = cliRunnerHost();
    expect(() =>
      validate.cli({ ...host, config: { pakage: "@acme/tools" } }),
    ).toThrow(/config: Unrecognized key: "pakage"/);
    expect(() =>
      validate.cli({ ...host, runner: { ...host.runner, proxy: {} } }),
    ).toThrow(/runner: Unrecognized key: "proxy"/);
    expect(() =>
      validate.cli({ ...host, children: { sb: { host: "switchboard" } } }),
    ).toThrow(/is a reactor runner, so the host must not declare `children`/);
  });
});

describe("declared verbs", () => {
  const functions = (mod: Record<string, unknown>) =>
    Object.entries(mod)
      .filter(([, value]) => typeof value === "function")
      .map(([name]) => name);

  it("cli lists exactly its verb functions (not its helpers)", () => {
    expect([...cliRunner.verbs].sort()).toEqual(
      functions(cliRun)
        .filter(
          (name) =>
            name !== "runCli" && name !== "loadCli" && name !== "loadOwnCli",
        )
        .sort(),
    );
  });

  it("mastra lists exactly its verb functions (not promptFromMessages)", () => {
    expect([...mastraRunner.verbs].sort()).toEqual(
      functions(mastra)
        .filter((name) => name !== "promptFromMessages")
        .sort(),
    );
  });
});

describe("PHHostRunners augmentation", () => {
  it("types host files by runner.module", () => {
    const typo = {
      name: "assistant",
      // @ts-expect-error -- `workDir` is not a mastra-runner option
      runner: { module: MASTRA, workDir: "x" },
    } satisfies PHHost;
    expect(typo.name).toBe("assistant");

    expectTypeOf<
      PHHostOutputs<typeof MASTRA>
    >().toEqualTypeOf<mastraRunner.MastraOutputs>();

    // Authors may write the key as a token; verbs only ever see a string.
    type DeclaredKey = NonNullable<
      NonNullable<mastraRunner.MastraHostInput["config"]>["apiKey"]
    >;
    expectTypeOf<{ $env: "OPENROUTER_API_KEY" }>().toExtend<DeclaredKey>();
    expectTypeOf<
      NonNullable<mastraRunner.MastraHost["config"]>["apiKey"]
    >().toEqualTypeOf<string | undefined>();
    expectTypeOf<PHHostOutputs<typeof CLI>>().toEqualTypeOf<
      Record<string, never>
    >();
    const cliTypo = {
      name: "tools",
      runner: { module: CLI },
      // @ts-expect-error -- `pakage` is not a cli-runner config key
      config: { pakage: "x" },
    } satisfies PHHost;
    expect(cliTypo.name).toBe("tools");
  });
});

const schemasDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "schemas",
);

/** Committed artifacts must match the live schemas. They are the DECLARED
 * forms (what authors write: token-able fields accept tokens). Fix a
 * failure with: pnpm --filter @powerhousedao/clint emit-schemas */
describe("emitted runner host schemas drift", () => {
  const emitted = {
    "host-mastra-runner.schema.json": emitHostJsonSchema(
      "host-mastra-runner",
      mastraRunner.declaredHostSchema,
    ),
    "host-cli-runner.schema.json": emitHostJsonSchema(
      "host-cli-runner",
      cliRunner.declaredHostSchema,
    ),
    "host-proxy-runner.schema.json": emitHostJsonSchema(
      "host-proxy-runner",
      proxyRunner.declaredHostSchema,
    ),
  };
  for (const [file, schema] of Object.entries(emitted)) {
    it(`schemas/${file} is current`, () => {
      const committed = JSON.parse(
        readFileSync(path.join(schemasDir, file), "utf8"),
      ) as unknown;
      expect(committed).toEqual(schema);
    });
  }
});
